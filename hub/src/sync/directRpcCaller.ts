import type { DirectRuntimeRegistry } from '../runtime/directRuntimeRegistry'

export class DirectRpcCaller {
    constructor(private readonly directRuntimeRegistry: DirectRuntimeRegistry) {}

    async session(sessionId: string, method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
        return await this.call(`${sessionId}:${method}`, params, timeoutMs)
    }

    async machine(machineId: string, method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
        return await this.call(`${machineId}:${method}`, params, timeoutMs)
    }

    async call(method: string, params: unknown, timeoutMs = 30_000): Promise<unknown> {
        if (!this.directRuntimeRegistry.hasRpc(method)) {
            throw new Error(`RPC handler not registered: ${method}`)
        }
        return parseRpcResponse(await this.directRuntimeRegistry.callRpc(method, params, timeoutMs))
    }
}

function parseRpcResponse(response: unknown): unknown {
    if (typeof response !== 'string') return response
    try {
        return JSON.parse(response) as unknown
    } catch {
        return response
    }
}
