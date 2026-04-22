import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { logger } from '@/ui/logger'
import { killProcessByChildProcess } from '@/utils/process'
import { runDetachedTask } from '@/utils/runDetachedTask'
import {
    asRecord,
    createAbortError,
    type JsonRpcLiteNotification,
    type JsonRpcLiteRequest,
    type JsonRpcLiteResponse,
    type PendingRequest,
    type RequestHandler,
} from './codexAppServerProtocol'
import { spawnCodexAppServer } from './codexAppServerSpawn'

type DisconnectHandler = () => void

export class CodexAppServerBridge {
    private process: ChildProcessWithoutNullStreams | null = null
    private connected = false
    private buffer = ''
    private nextId = 1
    private readonly pending = new Map<number, PendingRequest>()
    private readonly requestHandlers = new Map<string, RequestHandler>()
    private notificationHandler: ((method: string, params: unknown) => void) | null = null
    private disconnectHandler: DisconnectHandler | null = null
    private protocolError: Error | null = null

    static readonly DEFAULT_TIMEOUT_MS = 14 * 24 * 60 * 60 * 1000

    async connect(): Promise<void> {
        if (this.connected) {
            return
        }

        this.process = spawnCodexAppServer()
        this.process.stdout.setEncoding('utf8')
        this.process.stdout.on('data', (chunk) => this.handleStdout(chunk))
        this.process.stderr.setEncoding('utf8')
        this.process.stderr.on('data', (chunk) => {
            const text = chunk.toString().trim()
            if (text.length > 0) {
                logger.debug(`[CodexAppServer][stderr] ${text}`)
            }
        })
        this.process.on('exit', (code, signal) => {
            const message = `Codex app-server exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`
            logger.debug(message)
            this.handleDisconnect(new Error(message))
        })
        this.process.on('error', (error) => {
            logger.debug('[CodexAppServer] Process error', error)
            const message = error instanceof Error ? error.message : String(error)
            this.handleDisconnect(
                new Error(`Failed to spawn codex app-server: ${message}. Is it installed and on PATH?`, {
                    cause: error,
                })
            )
        })
        this.connected = true
        logger.debug('[CodexAppServer] Connected')
    }

    setNotificationHandler(handler: ((method: string, params: unknown) => void) | null): void {
        this.notificationHandler = handler
    }

    setDisconnectHandler(handler: DisconnectHandler | null): void {
        this.disconnectHandler = handler
    }

    registerRequestHandler(method: string, handler: RequestHandler): void {
        this.requestHandlers.set(method, handler)
    }

    async sendRequest(
        method: string,
        params?: unknown,
        options?: { signal?: AbortSignal; timeoutMs?: number }
    ): Promise<unknown> {
        if (!this.connected) {
            await this.connect()
        }

        const id = this.nextId++
        const payload: JsonRpcLiteRequest = { id, method, params }
        const timeoutMs = options?.timeoutMs ?? CodexAppServerBridge.DEFAULT_TIMEOUT_MS

        return new Promise((resolve, reject) => {
            let timeout: ReturnType<typeof setTimeout> | null = null
            let aborted = false

            const cleanup = () => {
                if (timeout) {
                    clearTimeout(timeout)
                }
                options?.signal?.removeEventListener('abort', onAbort)
            }

            const onAbort = () => {
                if (aborted) {
                    return
                }
                aborted = true
                this.pending.delete(id)
                cleanup()
                reject(createAbortError())
            }

            if (options?.signal) {
                if (options.signal.aborted) {
                    onAbort()
                    return
                }
                options.signal.addEventListener('abort', onAbort, { once: true })
            }

            if (Number.isFinite(timeoutMs)) {
                timeout = setTimeout(() => {
                    if (!this.pending.has(id)) {
                        return
                    }
                    this.pending.delete(id)
                    cleanup()
                    reject(new Error(`Codex app-server request '${method}' timed out after ${timeoutMs}ms`))
                }, timeoutMs)
                timeout.unref()
            }

            this.pending.set(id, {
                resolve: (value) => {
                    cleanup()
                    resolve(value)
                },
                reject: (error) => {
                    cleanup()
                    reject(error)
                },
                cleanup,
            })

            this.writePayload(payload)
        })
    }

    sendNotification(method: string, params?: unknown): void {
        this.writePayload({ method, params } satisfies JsonRpcLiteNotification)
    }

    async disconnect(): Promise<void> {
        if (!this.connected) {
            return
        }

        const child = this.process
        this.process = null

        try {
            child?.stdin.end()
            if (child) {
                await killProcessByChildProcess(child)
            }
        } catch (error) {
            logger.debug('[CodexAppServer] Error while stopping process', error)
        } finally {
            this.handleDisconnect(new Error('Codex app-server disconnected'))
        }

        logger.debug('[CodexAppServer] Disconnected')
    }

    private handleStdout(chunk: string): void {
        this.buffer += chunk
        let newlineIndex = this.buffer.indexOf('\n')

        while (newlineIndex >= 0) {
            const line = this.buffer.slice(0, newlineIndex).trim()
            this.buffer = this.buffer.slice(newlineIndex + 1)
            if (line.length > 0) {
                this.handleLine(line)
            }
            newlineIndex = this.buffer.indexOf('\n')
        }
    }

    private handleLine(line: string): void {
        if (this.protocolError) {
            return
        }

        let message: Record<string, unknown> | null = null
        try {
            message = asRecord(JSON.parse(line))
            if (!message) {
                logger.debug('[CodexAppServer] Ignoring non-object JSON from stdout', { line })
                return
            }
        } catch (error) {
            const protocolError = new Error('Failed to parse JSON from codex app-server')
            this.protocolError = protocolError
            logger.debug('[CodexAppServer] Failed to parse JSON line', { line, error })
            this.handleDisconnect(protocolError)
            this.process?.stdin.end()
            return
        }

        if (typeof message.method === 'string') {
            const method = message.method
            const params = 'params' in message ? message.params : null
            if ('id' in message && message.id !== undefined) {
                runDetachedTask(
                    () => this.handleIncomingRequest({ id: message.id, method, params }),
                    '[CodexAppServer] Failed to handle incoming request'
                )
                return
            }
            this.notificationHandler?.(method, params ?? null)
            return
        }

        if ('id' in message) {
            this.handleResponse(message as JsonRpcLiteResponse)
        }
    }

    private async handleIncomingRequest(request: { id: unknown; method: string; params?: unknown }): Promise<void> {
        const responseId = typeof request.id === 'number' || typeof request.id === 'string' ? request.id : null
        const handler = this.requestHandlers.get(request.method)
        if (!handler) {
            this.writePayload({
                id: responseId,
                error: { code: -32601, message: `Method not found: ${request.method}` },
            } satisfies JsonRpcLiteResponse)
            return
        }

        try {
            const result = await handler(request.params ?? null)
            this.writePayload({ id: responseId, result } satisfies JsonRpcLiteResponse)
        } catch (error) {
            this.writePayload({
                id: responseId,
                error: {
                    code: -32603,
                    message: error instanceof Error ? error.message : 'Internal error',
                },
            } satisfies JsonRpcLiteResponse)
        }
    }

    private handleResponse(response: JsonRpcLiteResponse): void {
        if (response.id === null || response.id === undefined) {
            logger.debug('[CodexAppServer] Received response without id')
            return
        }
        if (typeof response.id !== 'number') {
            logger.debug('[CodexAppServer] Received response with non-numeric id', response.id)
            return
        }

        const pending = this.pending.get(response.id)
        if (!pending) {
            logger.debug('[CodexAppServer] Received response with no pending request', response.id)
            return
        }
        this.pending.delete(response.id)

        if (response.error) {
            pending.reject(new Error(response.error.message))
            return
        }

        pending.resolve(response.result)
    }

    private writePayload(payload: JsonRpcLiteRequest | JsonRpcLiteNotification | JsonRpcLiteResponse): void {
        this.process?.stdin.write(`${JSON.stringify(payload)}\n`)
    }

    private handleDisconnect(error: Error): void {
        this.rejectAllPending(error)
        this.connected = false
        this.process = null
        this.buffer = ''
        this.protocolError = null
        this.disconnectHandler?.()
    }

    private rejectAllPending(error: Error): void {
        for (const { reject, cleanup } of this.pending.values()) {
            cleanup()
            reject(error)
        }
        this.pending.clear()
    }
}
