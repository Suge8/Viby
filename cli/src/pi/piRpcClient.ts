import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { delimiter, isAbsolute } from 'node:path'
import type { PiThinkingLevel } from './messageCodec'
import { buildPiRpcArgs, resolvePiSessionResumeFlag } from './piRpcLaunch'
import { PiRpcPendingRequests } from './piRpcPending'
import {
    isPiRpcFailure,
    PiRpcConnectionError,
    type PiRpcEventListener,
    PiRpcJsonlReader,
    type PiRpcResponse,
    toPiRpcConnectionError,
} from './piRpcProtocol'

const DEFAULT_PI_COMMAND = 'pi'
const STOP_TIMEOUT_MS = 1_000
const CONTROL_REQUEST_TIMEOUT_MS = 12_000
const MODEL_CATALOG_REQUEST_TIMEOUT_MS = 20_000
const RUNTIME_CONFIG_REQUEST_TIMEOUT_MS = 30_000

export type PiRpcModel = {
    provider: string
    id: string
    name?: string
    api?: string
    reasoning?: boolean
    input?: unknown
    contextWindow?: number
    maxTokens?: number
}

export type PiRpcState = {
    model?: PiRpcModel | null
    thinkingLevel: PiThinkingLevel
    isStreaming: boolean
    sessionId: string
}

type IdleWaiter = {
    resolve: () => void
    reject: (error: Error) => void
}

export function resolvePiExecutable(env: NodeJS.ProcessEnv = process.env): string {
    const explicitPath = env.VIBY_PI_PATH?.trim() || env.PI_PATH?.trim()
    if (explicitPath) {
        assertExecutable(explicitPath)
        return explicitPath
    }

    return DEFAULT_PI_COMMAND
}

function assertExecutable(path: string): void {
    if (!isAbsolute(path)) {
        throw new Error(`Pi executable path must be absolute: ${path}`)
    }
    accessSync(path, constants.X_OK)
}

function buildPiEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    return {
        ...env,
        PATH: env.PATH?.split(delimiter).filter(Boolean).join(delimiter),
    }
}

export class PiRpcClient {
    private process: ChildProcessWithoutNullStreams | null = null
    private pending = new PiRpcPendingRequests()
    private listeners = new Set<PiRpcEventListener>()
    private idleWaiters: IdleWaiter[] = []
    private stdoutReader = new PiRpcJsonlReader((line) => this.handleLine(line))
    private streaming = false
    private stderr = ''

    constructor(
        private readonly options: {
            command?: string
            cwd: string
            env?: NodeJS.ProcessEnv
            model?: string
            resumeSessionId?: string
        }
    ) {}

    async start(): Promise<void> {
        if (this.process) {
            throw new Error('Pi RPC client already started')
        }

        const command = this.options.command ?? resolvePiExecutable(this.options.env)
        const env = buildPiEnv(this.options.env ?? process.env)
        const sessionFlag = this.options.resumeSessionId
            ? await resolvePiSessionResumeFlag(command, { cwd: this.options.cwd, env })
            : '--session'
        const args = buildPiRpcArgs(
            { model: this.options.model, resumeSessionId: this.options.resumeSessionId },
            sessionFlag
        )

        const child = spawn(command, args, {
            cwd: this.options.cwd,
            env,
            stdio: ['pipe', 'pipe', 'pipe'],
        })
        this.process = child
        this.attach(child)
        await new Promise<void>((resolve, reject) => {
            child.once('error', reject)
            setTimeout(resolve, 0)
        })
        if (child.exitCode !== null) {
            throw new Error(`Pi RPC exited during startup: ${this.stderr.trim()}`)
        }
    }

    onEvent(listener: PiRpcEventListener): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    async prompt(message: string): Promise<void> {
        this.streaming = true
        try {
            const response = await this.send('prompt', { message }, { timeoutMs: null })
            if (isPiRpcFailure(response)) {
                throw new Error(response.error)
            }
            await this.waitForIdle()
        } catch (error) {
            this.streaming = false
            this.resolveIdleWaiters()
            throw error
        }
    }

    async abort(): Promise<void> {
        await this.send('abort')
    }

    async getState(): Promise<PiRpcState> {
        return this.getData<PiRpcState>(await this.send('get_state'))
    }

    async getAvailableModels(): Promise<PiRpcModel[]> {
        const response = await this.send('get_available_models', {}, { timeoutMs: MODEL_CATALOG_REQUEST_TIMEOUT_MS })
        return this.getData<{ models: PiRpcModel[] }>(response).models
    }

    async setModel(model: PiRpcModel): Promise<void> {
        await this.send(
            'set_model',
            { provider: model.provider, modelId: model.id },
            { timeoutMs: RUNTIME_CONFIG_REQUEST_TIMEOUT_MS }
        )
    }

    async setThinkingLevel(level: PiThinkingLevel): Promise<void> {
        await this.send('set_thinking_level', { level }, { timeoutMs: RUNTIME_CONFIG_REQUEST_TIMEOUT_MS })
    }

    async stop(): Promise<void> {
        const child = this.process
        if (!child) return
        this.process = null
        child.kill('SIGTERM')
        await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
                child.kill('SIGKILL')
                resolve()
            }, STOP_TIMEOUT_MS)
            child.once('exit', () => {
                clearTimeout(timeout)
                resolve()
            })
        })
        this.rejectAll(new PiRpcConnectionError('Pi RPC client stopped'))
    }

    private attach(child: ChildProcessWithoutNullStreams): void {
        child.stdout.on('data', (chunk) => this.stdoutReader.push(chunk.toString()))
        child.stdout.on('end', () => this.stdoutReader.end())
        child.stderr.on('data', (chunk) => {
            this.stderr += chunk.toString()
        })
        child.stdin.on('error', (error) => this.rejectAll(toPiRpcConnectionError(error)))
        child.once('error', (error) => this.rejectAll(toPiRpcConnectionError(error)))
        child.once('exit', (code, signal) => {
            if (this.process === child) {
                this.process = null
            }
            this.rejectAll(
                new PiRpcConnectionError(`Pi RPC exited (${signal ?? code ?? 'unknown'}): ${this.stderr.trim()}`)
            )
        })
    }

    private handleLine(line: string): void {
        const trimmed = line.trim()
        if (!trimmed) return
        let parsed: Record<string, unknown>
        try {
            parsed = JSON.parse(trimmed) as Record<string, unknown>
        } catch (error) {
            const detail = error instanceof Error ? error.message : 'unknown parse failure'
            this.rejectAll(new PiRpcConnectionError(`Invalid Pi RPC JSON: ${detail}`))
            return
        }
        if (parsed.type === 'response' && typeof parsed.id === 'string') {
            this.pending.resolve(parsed as PiRpcResponse)
            return
        }
        this.updateStreamingState(parsed)
        for (const listener of this.listeners) {
            listener(parsed)
        }
    }

    private async waitForIdle(): Promise<void> {
        if (!this.streaming) {
            return
        }
        await new Promise<void>((resolve, reject) => {
            this.idleWaiters.push({ resolve, reject })
        })
    }

    private updateStreamingState(event: Record<string, unknown>): void {
        if (event.type === 'agent_start') {
            this.streaming = true
            return
        }
        if (event.type !== 'agent_end') {
            return
        }
        this.streaming = false
        this.resolveIdleWaiters()
    }

    private async send(
        command: string,
        payload: Record<string, unknown> = {},
        options: { timeoutMs?: number | null } = {}
    ): Promise<PiRpcResponse> {
        if (!this.process) {
            throw new PiRpcConnectionError('Pi RPC client is not running')
        }
        const timeoutMs = options.timeoutMs === undefined ? CONTROL_REQUEST_TIMEOUT_MS : options.timeoutMs
        const request = this.pending.create(command, payload, timeoutMs)
        try {
            this.process.stdin.write(request.line)
        } catch (error) {
            this.pending.cancel(request.id)
            throw error
        }
        return await request.response
    }

    private getData<T>(response: PiRpcResponse): T {
        if (isPiRpcFailure(response)) {
            throw new Error(response.error)
        }
        return response.data as T
    }

    private resolveIdleWaiters(): void {
        const waiters = this.idleWaiters.splice(0)
        for (const waiter of waiters) {
            waiter.resolve()
        }
    }

    private rejectIdleWaiters(error: Error): void {
        const waiters = this.idleWaiters.splice(0)
        for (const waiter of waiters) {
            waiter.reject(error)
        }
    }

    private rejectAll(error: Error): void {
        this.streaming = false
        this.pending.rejectAll(error)
        this.rejectIdleWaiters(error)
    }
}
