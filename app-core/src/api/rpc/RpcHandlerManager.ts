import { logger as defaultLogger } from '@/ui/logger'
import type { RpcHandler, RpcHandlerConfig, RpcHandlerMap, RpcRequest } from './types'

type RpcRegistrationChannel = {
    send(event: 'rpc-register', payload: { method: string }): void
}

function safeJsonParse(value: string): unknown {
    try {
        return JSON.parse(value) as unknown
    } catch {
        return null
    }
}

export class RpcHandlerManager {
    private handlers: RpcHandlerMap = new Map()
    private readonly scopePrefix: string
    private readonly logger: (message: string, data?: unknown) => void
    private channel: RpcRegistrationChannel | null = null

    constructor(config: RpcHandlerConfig) {
        this.scopePrefix = config.scopePrefix
        this.logger = config.logger || ((msg, data) => defaultLogger.debug(msg, data))
    }

    registerHandler<TRequest = unknown, TResponse = unknown>(
        method: string,
        handler: RpcHandler<TRequest, TResponse>
    ): void {
        const prefixedMethod = this.getPrefixedMethod(method)
        this.handlers.set(prefixedMethod, handler as RpcHandler)
        this.channel?.send('rpc-register', { method: prefixedMethod })
    }

    async handleRequest(request: RpcRequest): Promise<string> {
        try {
            const handler = this.handlers.get(request.method)
            if (!handler) {
                this.logger('[RPC] [ERROR] Method not found', { method: request.method })
                return JSON.stringify({ error: 'Method not found' })
            }

            const params = safeJsonParse(request.params)
            return JSON.stringify(await handler(params))
        } catch (error) {
            const details =
                error instanceof Error ? { message: error.message, stack: error.stack } : { error: String(error) }
            this.logger('[RPC] [ERROR] Error handling request', details)
            return JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })
        }
    }

    connect(channel: RpcRegistrationChannel): void {
        this.channel = channel
        for (const [method] of this.handlers) channel.send('rpc-register', { method })
    }

    disconnect(): void {
        this.channel = null
    }

    getHandlerCount(): number {
        return this.handlers.size
    }

    hasHandler(method: string): boolean {
        return this.handlers.has(this.getPrefixedMethod(method))
    }

    listMethods(): string[] {
        return Array.from(this.handlers.keys())
    }

    clearHandlers(): void {
        this.handlers.clear()
        this.logger('Cleared all RPC handlers')
    }

    private getPrefixedMethod(method: string): string {
        return `${this.scopePrefix}:${method}`
    }
}

export function createRpcHandlerManager(config: RpcHandlerConfig): RpcHandlerManager {
    return new RpcHandlerManager(config)
}
