import { randomUUID } from 'node:crypto'
import type { ProviderAdapterInput } from '@viby/protocol/providerAdapterProtocol'
import { serializeProviderAdapterEvent } from '@viby/protocol/providerAdapterProtocol'
import type { RuntimeEventChannel } from './runtimeEventTransport'

export const PROVIDER_ADAPTER_ACK_TIMEOUT_MS = 15_000

type AckResolver = {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timeout: ReturnType<typeof setTimeout>
}
type AdapterAckInput = Extract<ProviderAdapterInput, { type: 'runtime.metadata-result' | 'runtime.agent-state-result' }>

export class ProviderAdapterEventChannel implements RuntimeEventChannel {
    private connected = true
    private readonly pendingAcks = new Map<string, AckResolver>()

    constructor(
        private readonly sessionId: string,
        private readonly requestTimeoutMs = PROVIDER_ADAPTER_ACK_TIMEOUT_MS
    ) {}

    send(event: string, payload?: unknown): void {
        if (!this.connected) return
        if (event === 'message' && isRecord(payload)) {
            this.write({ type: 'runtime.message', sessionId: this.sessionId, message: payload.message as never })
        } else if (event === 'messages-consumed' && isRecord(payload)) {
            this.write({
                type: 'runtime.messages-consumed',
                sessionId: this.sessionId,
                localIds: readStringArray(payload.localIds),
            })
        } else if (event === 'messages-canceled' && isRecord(payload)) {
            this.write({
                type: 'runtime.messages-canceled',
                sessionId: this.sessionId,
                localIds: readStringArray(payload.localIds),
            })
        } else if (event === 'stream-update') {
            this.write({ type: 'runtime.stream-update', update: payload as never })
        } else if (event === 'session-runtime-state') {
            this.write({ type: 'runtime.session-runtime-state', payload: payload as never })
        } else if (event === 'session-alive') {
            this.write({ type: 'runtime.session-alive', payload: payload as never })
        } else if (event === 'session-end' && isRecord(payload)) {
            this.write({
                type: 'runtime.session-end',
                sessionId: this.sessionId,
                time: Number(payload.time) || Date.now(),
            })
        } else if (event === 'command-capabilities-invalidated') {
            this.write({ type: 'runtime.command-capabilities-invalidated', sessionId: this.sessionId })
        } else if (event === 'rpc-register' && isRecord(payload) && typeof payload.method === 'string') {
            this.write({ type: 'runtime.rpc-register', method: payload.method })
        } else if (event.startsWith('terminal:')) {
            this.writeTerminalEvent(event, payload)
        }
    }

    sendVolatile(event: string, payload?: unknown): void {
        this.send(event, payload)
    }

    async request(event: string, payload?: unknown): Promise<unknown> {
        const requestId = randomUUID()
        const response = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingAcks.delete(requestId)
                reject(new Error(`Runtime ${event} ack timed out: ${this.sessionId}`))
            }, this.requestTimeoutMs)
            timeout.unref?.()
            this.pendingAcks.set(requestId, { resolve, reject, timeout })
        })
        if (event === 'update-metadata' && isRecord(payload)) {
            this.write({
                type: 'runtime.metadata-update',
                requestId,
                sessionId: this.sessionId,
                expectedVersion: Number(payload.expectedVersion),
                metadata: payload.metadata as never,
                touchUpdatedAt: typeof payload.touchUpdatedAt === 'boolean' ? payload.touchUpdatedAt : undefined,
            })
            return await response
        }
        if (event === 'update-state' && isRecord(payload)) {
            this.write({
                type: 'runtime.agent-state-update',
                requestId,
                sessionId: this.sessionId,
                expectedVersion: Number(payload.expectedVersion),
                agentState: payload.agentState as never,
            })
            return await response
        }
        this.rejectAck(requestId, new Error(`Unsupported runtime request event: ${event}`))
        return await response
    }

    disconnect(): void {
        this.connected = false
        this.rejectAllAcks(new Error(`Runtime event channel disconnected: ${this.sessionId}`))
    }

    resolveAck(input: AdapterAckInput): void {
        const pending = this.pendingAcks.get(input.requestId)
        if (!pending) return
        this.pendingAcks.delete(input.requestId)
        clearTimeout(pending.timeout)
        const valueKey = input.type === 'runtime.metadata-result' ? 'metadata' : 'agentState'
        if (input.result === 'success') {
            pending.resolve({ result: 'success', version: input.version, [valueKey]: input.value })
        } else if (input.result === 'version-mismatch') {
            pending.resolve({ result: 'version-mismatch', version: input.version, [valueKey]: input.value })
        } else {
            pending.resolve({ result: 'error', reason: input.error })
        }
    }

    sendRpcResponse(requestId: string, response: unknown): void {
        this.write({ type: 'runtime.rpc-response', requestId, response })
    }

    private write(event: Parameters<typeof serializeProviderAdapterEvent>[0]): void {
        process.stdout.write(serializeProviderAdapterEvent(event))
    }

    private writeTerminalEvent(event: string, payload: unknown): void {
        if (!isRecord(payload)) return
        const type = event.slice('terminal:'.length)
        if (type === 'ready' || type === 'output' || type === 'exit' || type === 'error') {
            this.write({ type: 'runtime.terminal-event', event: { ...payload, type } as never })
        }
    }

    private rejectAck(requestId: string, error: Error): void {
        const pending = this.pendingAcks.get(requestId)
        if (!pending) return
        this.pendingAcks.delete(requestId)
        clearTimeout(pending.timeout)
        pending.reject(error)
    }

    private rejectAllAcks(error: Error): void {
        for (const requestId of this.pendingAcks.keys()) this.rejectAck(requestId, error)
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function readStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}
