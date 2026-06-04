import { randomUUID } from 'node:crypto'
import type { ProviderAdapterInput, ProviderAdapterRuntimeEvent } from '@viby/protocol/providerAdapterProtocol'

export type DirectRuntimeTarget = {
    id: string
    callRpc(method: string, params: unknown, timeoutMs: number): Promise<unknown>
    send(input: ProviderAdapterInput): boolean
}

type ProviderTerminalEvent = Extract<ProviderAdapterRuntimeEvent, { type: 'runtime.terminal-event' }>['event']
export type DirectRuntimeTerminalEvent = ProviderTerminalEvent & { targetId: string }

type TerminalListener = (event: DirectRuntimeTerminalEvent) => void

export class DirectRuntimeRegistry {
    private readonly rpcTargets = new Map<string, DirectRuntimeTarget>()
    private readonly sessionTargets = new Map<string, DirectRuntimeTarget>()
    private readonly terminalListeners = new Set<TerminalListener>()

    registerSession(sessionId: string, target: DirectRuntimeTarget): void {
        this.sessionTargets.set(sessionId, target)
    }

    unregisterTarget(targetId: string): void {
        for (const [method, target] of this.rpcTargets) {
            if (target.id === targetId) this.rpcTargets.delete(method)
        }
        for (const [sessionId, target] of this.sessionTargets) {
            if (target.id === targetId) this.sessionTargets.delete(sessionId)
        }
    }

    registerRpc(method: string, target: DirectRuntimeTarget): void {
        this.rpcTargets.set(method, target)
    }

    getSessionTarget(sessionId: string): DirectRuntimeTarget | null {
        return this.sessionTargets.get(sessionId) ?? null
    }

    hasRpc(method: string): boolean {
        return this.rpcTargets.has(method)
    }

    async callRpc(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
        const target = this.rpcTargets.get(method)
        if (!target) throw new Error(`RPC handler not registered: ${method}`)
        return await target.callRpc(method, params, timeoutMs)
    }

    subscribeTerminal(listener: TerminalListener): () => void {
        this.terminalListeners.add(listener)
        return () => this.terminalListeners.delete(listener)
    }

    emitTerminalEvent(targetId: string, event: ProviderTerminalEvent): void {
        const next = { ...event, targetId }
        for (const listener of this.terminalListeners) listener(next)
    }
}

export function createDirectRuntimeTargetId(pid: number): string {
    return `provider:${pid}:${randomUUID()}`
}
