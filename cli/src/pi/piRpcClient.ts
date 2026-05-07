import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { delimiter, isAbsolute } from 'node:path'
import { createInterface } from 'node:readline'
import type { PiThinkingLevel } from './messageCodec'

const DEFAULT_PI_COMMAND = 'pi'
const STOP_TIMEOUT_MS = 1_000
const REQUEST_TIMEOUT_MS = 8_000

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

type PiRpcResponse =
    | { id?: string; type: 'response'; command: string; success: true; data?: unknown }
    | { id?: string; type: 'response'; command: string; success: false; error: string }

type PendingRequest = {
    timeout: ReturnType<typeof setTimeout>
    resolve: (value: PiRpcResponse) => void
    reject: (error: Error) => void
}

export type PiRpcEventListener = (event: Record<string, unknown>) => void

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
    private pending = new Map<string, PendingRequest>()
    private listeners = new Set<PiRpcEventListener>()
    private idleWaiters: Array<() => void> = []
    private streaming = false
    private nextId = 1
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
        const args = ['--mode', 'rpc']
        const model = this.options.model?.trim()
        if (model) {
            args.push('--model', model)
        }
        const resumeSessionId = this.options.resumeSessionId?.trim()
        if (resumeSessionId) {
            args.push('--session', resumeSessionId)
        }

        const child = spawn(command, args, {
            cwd: this.options.cwd,
            env: buildPiEnv(this.options.env ?? process.env),
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
            await this.send('prompt', { message })
            await this.waitForIdle()
        } catch (error) {
            this.streaming = false
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
        return this.getData<{ models: PiRpcModel[] }>(await this.send('get_available_models')).models
    }

    async setModel(model: PiRpcModel): Promise<void> {
        await this.send('set_model', { provider: model.provider, modelId: model.id })
    }

    async setThinkingLevel(level: PiThinkingLevel): Promise<void> {
        await this.send('set_thinking_level', { level })
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
        this.rejectAll(new Error('Pi RPC client stopped'))
    }

    private attach(child: ChildProcessWithoutNullStreams): void {
        createInterface({ input: child.stdout }).on('line', (line) => this.handleLine(line))
        child.stderr.on('data', (chunk) => {
            this.stderr += chunk.toString()
        })
        child.once('error', (error) => this.rejectAll(error))
        child.once('exit', (code, signal) => {
            this.rejectAll(new Error(`Pi RPC exited (${signal ?? code ?? 'unknown'}): ${this.stderr.trim()}`))
        })
    }

    private handleLine(line: string): void {
        const trimmed = line.trim()
        if (!trimmed) return
        const parsed = JSON.parse(trimmed) as Record<string, unknown>
        if (parsed.type === 'response' && typeof parsed.id === 'string') {
            const pending = this.pending.get(parsed.id)
            if (pending) {
                this.pending.delete(parsed.id)
                clearTimeout(pending.timeout)
                pending.resolve(parsed as PiRpcResponse)
            }
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
        await new Promise<void>((resolve) => {
            this.idleWaiters.push(resolve)
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
        const waiters = this.idleWaiters.splice(0)
        for (const waiter of waiters) {
            waiter()
        }
    }

    private async send(command: string, payload: Record<string, unknown> = {}): Promise<PiRpcResponse> {
        if (!this.process) {
            throw new Error('Pi RPC client is not running')
        }
        const id = String(this.nextId++)
        const request = { ...payload, id, type: command }
        const responsePromise = new Promise<PiRpcResponse>((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pending.delete(id)
                reject(new Error(`Pi RPC ${command} timed out`))
            }, REQUEST_TIMEOUT_MS)
            timeout.unref?.()
            this.pending.set(id, { timeout, resolve, reject })
        })
        this.process.stdin.write(`${JSON.stringify(request)}\n`)
        return await responsePromise
    }

    private getData<T>(response: PiRpcResponse): T {
        if (!response.success) {
            throw new Error(response.error)
        }
        return response.data as T
    }

    private rejectAll(error: Error): void {
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timeout)
            pending.reject(error)
        }
        this.pending.clear()
        const waiters = this.idleWaiters.splice(0)
        for (const waiter of waiters) {
            waiter()
        }
    }
}
