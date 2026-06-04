import type { ChildProcess } from 'node:child_process'
import {
    type ProviderAdapterInput,
    type ProviderAdapterRuntimeEvent,
    serializeProviderAdapterInput,
} from '@viby/protocol/providerAdapterProtocol'
import { logger } from '@/ui/logger'
import type { HubRuntimeCore } from '../../../../hub/src/runtime/core'
import {
    createDirectRuntimeTargetId,
    type DirectRuntimeRegistry,
} from '../../../../hub/src/runtime/directRuntimeRegistry'

type PendingRpc = {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timeout: ReturnType<typeof setTimeout>
}

export class ProviderAdapterBridge {
    readonly targetId: string
    private readonly pendingRpc = new Map<string, PendingRpc>()
    private sessionId: string | null = null

    constructor(
        private readonly child: ChildProcess,
        private readonly directRuntimeRegistry: DirectRuntimeRegistry,
        private readonly getRuntimeCore: () => HubRuntimeCore | null
    ) {
        this.targetId = createDirectRuntimeTargetId(child.pid ?? 0)
    }

    send(input: ProviderAdapterInput): boolean {
        if (!this.child.stdin?.writable) return false
        return this.child.stdin.write(serializeProviderAdapterInput(input))
    }

    registerSession(sessionId: string): void {
        this.sessionId = sessionId
        this.directRuntimeRegistry.registerSession(sessionId, {
            id: this.targetId,
            send: (input) => this.send(input),
            callRpc: async (method, params, timeoutMs) => await this.callRpc(method, params, timeoutMs),
        })
    }

    async handleEvent(event: ProviderAdapterRuntimeEvent): Promise<void> {
        if (event.type === 'runtime.rpc-response') {
            this.resolveRpc(event.requestId, event.response)
            return
        }
        if (event.type === 'runtime.rpc-register') {
            this.directRuntimeRegistry.registerRpc(event.method, {
                id: this.targetId,
                send: (input) => this.send(input),
                callRpc: async (method, params, timeoutMs) => await this.callRpc(method, params, timeoutMs),
            })
            return
        }
        if (event.type === 'runtime.terminal-event') {
            this.directRuntimeRegistry.emitTerminalEvent(this.targetId, event.event)
            return
        }
        const runtimeCore = this.getRuntimeCore()
        if (!runtimeCore) throw new Error(`Runtime core unavailable for provider adapter event: ${event.type}`)
        const response = await runtimeCore.syncEngine.ingestRuntimeEvent(event)
        if (response) this.send(response)
    }

    dispose(): void {
        this.directRuntimeRegistry.unregisterTarget(this.targetId)
        for (const [requestId, pending] of this.pendingRpc) {
            clearTimeout(pending.timeout)
            pending.reject(new Error(`Runtime process disconnected before RPC response: ${requestId}`))
        }
        this.pendingRpc.clear()
    }

    private async callRpc(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
        const requestId = `${Date.now()}:${Math.random().toString(36).slice(2)}`
        return await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRpc.delete(requestId)
                reject(new Error(`Runtime RPC timed out: ${method}`))
            }, timeoutMs)
            timeout.unref?.()
            this.pendingRpc.set(requestId, { resolve, reject, timeout })
            const sent = this.send({ type: 'runtime.rpc-request', requestId, method, params })
            if (!sent) {
                clearTimeout(timeout)
                this.pendingRpc.delete(requestId)
                reject(new Error(`Runtime process stdin closed: ${method}`))
            }
        })
    }

    private resolveRpc(requestId: string, response: unknown): void {
        const pending = this.pendingRpc.get(requestId)
        if (!pending) {
            logger.debug('[ProviderAdapterBridge] Ignoring unknown RPC response', { requestId })
            return
        }
        this.pendingRpc.delete(requestId)
        clearTimeout(pending.timeout)
        pending.resolve(response)
    }
}
