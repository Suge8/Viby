import { createInterface } from 'node:readline'
import type { Writable } from 'node:stream'
import { logger } from '@/ui/logger'
import { Stream } from './stream'
import type {
    CanCallToolCallback,
    CanUseToolControlRequest,
    CanUseToolControlResponse,
    ControlCancelRequest,
    ControlRequest,
    ControlResponseHandler,
    PermissionResult,
    SDKControlRequest,
    SDKControlResponse,
    SDKMessage,
} from './types'
import { logDebug } from './utils'

function logDetachedQueryTaskError(label: string, error: unknown): void {
    logger.debug(`[Claude SDK] ${label}`, error)
}

export class Query implements AsyncIterableIterator<SDKMessage> {
    private pendingControlResponses = new Map<string, ControlResponseHandler>()
    private cancelControllers = new Map<string, AbortController>()
    private sdkMessages: AsyncIterableIterator<SDKMessage>
    private inputStream = new Stream<SDKMessage>()
    private canCallTool?: CanCallToolCallback
    private promptFailure: Error | null = null

    constructor(
        private childStdin: Writable | null,
        private childStdout: NodeJS.ReadableStream,
        private processExitPromise: Promise<void>,
        canCallTool?: CanCallToolCallback
    ) {
        this.canCallTool = canCallTool
        this.readMessages().catch((error) => {
            logDetachedQueryTaskError('readMessages failed', error)
        })
        this.sdkMessages = this.readSdkMessages()
    }

    setError(error: Error): void {
        this.inputStream.error(error)
    }

    registerPromptFailure(error: Error): boolean {
        if (this.promptFailure) {
            return false
        }
        this.promptFailure = error
        this.cleanupControllers()
        return true
    }

    getPromptFailure(): Error | null {
        return this.promptFailure
    }

    next(...args: [] | [undefined]): Promise<IteratorResult<SDKMessage>> {
        return this.sdkMessages.next(...args)
    }

    return(value?: unknown): Promise<IteratorResult<SDKMessage>> {
        if (this.sdkMessages.return) {
            return this.sdkMessages.return(value)
        }
        return Promise.resolve({ done: true, value: undefined })
    }

    throw(e: unknown): Promise<IteratorResult<SDKMessage>> {
        if (this.sdkMessages.throw) {
            return this.sdkMessages.throw(e)
        }
        return Promise.reject(e)
    }

    [Symbol.asyncIterator](): AsyncIterableIterator<SDKMessage> {
        return this
    }

    private async readMessages(): Promise<void> {
        const rl = createInterface({ input: this.childStdout })
        let hadError = false

        try {
            for await (const line of rl) {
                if (this.promptFailure) {
                    break
                }
                if (!line.trim()) {
                    continue
                }

                try {
                    const message = JSON.parse(line) as unknown as SDKMessage | SDKControlResponse
                    if (this.promptFailure) {
                        break
                    }
                    if (message.type === 'control_response') {
                        const controlResponse = message as SDKControlResponse
                        const handler = this.pendingControlResponses.get(controlResponse.response.request_id)
                        if (handler) {
                            handler(controlResponse.response)
                        }
                        continue
                    }
                    if (message.type === 'control_request') {
                        await this.handleControlRequest(message as unknown as CanUseToolControlRequest)
                        continue
                    }
                    if (message.type === 'control_cancel_request') {
                        this.handleControlCancelRequest(message as unknown as ControlCancelRequest)
                        continue
                    }
                    this.inputStream.enqueue(message)
                } catch {
                    logger.debug(line)
                }
            }

            await this.processExitPromise
        } catch (error) {
            hadError = true
            this.inputStream.error(error as Error)
        } finally {
            if (!hadError && !this.inputStream.hasTerminalError) {
                this.inputStream.done()
            }
            this.cleanupControllers()
            rl.close()
        }
    }

    private async *readSdkMessages(): AsyncIterableIterator<SDKMessage> {
        for await (const message of this.inputStream) {
            yield message
        }
    }

    async interrupt(): Promise<void> {
        if (!this.childStdin) {
            throw new Error('Interrupt requires --input-format stream-json')
        }

        await this.request(
            {
                subtype: 'interrupt',
            },
            this.childStdin
        )
    }

    private request(request: ControlRequest, childStdin: Writable): Promise<SDKControlResponse['response']> {
        const requestId = Math.random().toString(36).substring(2, 15)
        const sdkRequest: SDKControlRequest = {
            request_id: requestId,
            type: 'control_request',
            request,
        }

        return new Promise((resolve, reject) => {
            this.pendingControlResponses.set(requestId, (response) => {
                if (response.subtype === 'success') {
                    resolve(response)
                } else {
                    reject(new Error(response.error))
                }
            })

            childStdin.write(JSON.stringify(sdkRequest) + '\n')
        })
    }

    private async handleControlRequest(request: CanUseToolControlRequest): Promise<void> {
        if (!this.childStdin) {
            logDebug('Cannot handle control request - no stdin available')
            return
        }

        const controller = new AbortController()
        this.cancelControllers.set(request.request_id, controller)

        try {
            const response = await this.processControlRequest(request, controller.signal)
            if (this.promptFailure || controller.signal.aborted || !this.childStdin.writable) {
                return
            }
            const controlResponse: CanUseToolControlResponse = {
                type: 'control_response',
                response: {
                    subtype: 'success',
                    request_id: request.request_id,
                    response,
                },
            }
            this.childStdin.write(JSON.stringify(controlResponse) + '\n')
        } catch (error) {
            if (this.promptFailure || controller.signal.aborted || !this.childStdin.writable) {
                return
            }
            const controlErrorResponse: CanUseToolControlResponse = {
                type: 'control_response',
                response: {
                    subtype: 'error',
                    request_id: request.request_id,
                    error: error instanceof Error ? error.message : String(error),
                },
            }
            this.childStdin.write(JSON.stringify(controlErrorResponse) + '\n')
        } finally {
            this.cancelControllers.delete(request.request_id)
        }
    }

    private handleControlCancelRequest(request: ControlCancelRequest): void {
        const controller = this.cancelControllers.get(request.request_id)
        if (controller) {
            controller.abort()
            this.cancelControllers.delete(request.request_id)
        }
    }

    private async processControlRequest(
        request: CanUseToolControlRequest,
        signal: AbortSignal
    ): Promise<PermissionResult> {
        if (request.request.subtype === 'can_use_tool') {
            if (!this.canCallTool) {
                throw new Error('canCallTool callback is not provided.')
            }
            return this.canCallTool(request.request.tool_name, request.request.input, {
                signal,
            })
        }

        throw new Error('Unsupported control request subtype: ' + request.request.subtype)
    }

    private cleanupControllers(): void {
        for (const [requestId, controller] of this.cancelControllers.entries()) {
            controller.abort()
            this.cancelControllers.delete(requestId)
        }
    }
}

export function logQueryTaskError(label: string, error: unknown): void {
    logDetachedQueryTaskError(label, error)
}
