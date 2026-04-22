import { vi } from 'vitest'
import type { RecoveryState } from './sessionRecovery'
import type { Session } from './types'

type SocketArgs = unknown[]
type SocketListener = (...args: SocketArgs) => void
type SocketCall = { event: string; args: SocketArgs }
export type FakeSocket = {
    listeners: Map<string, SocketListener[]>
    emitCalls: SocketCall[]
    volatileEmitCalls: SocketCall[]
    volatile: {
        emit: (event: string, ...args: SocketArgs) => void
    }
    on: (event: string, handler: SocketListener) => FakeSocket
    off: (event: string, handler: SocketListener) => FakeSocket
    emit: (event: string, ...args: SocketArgs) => void
    emitWithAck: ReturnType<typeof vi.fn>
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    timeout: ReturnType<typeof vi.fn>
}
type AuthResponse = {
    data: {
        token: string
        user: { id: number }
    }
    headers: Record<string, string>
}

export function createFakeSocket(): FakeSocket {
    const listeners = new Map<string, SocketListener[]>()
    const socket = {
        listeners,
        emitCalls: [] as SocketCall[],
        volatileEmitCalls: [] as SocketCall[],
        volatile: {
            emit: (event: string, ...args: SocketArgs) => {
                socket.volatileEmitCalls.push({ event, args })
            },
        },
        on(event: string, handler: SocketListener) {
            const current = listeners.get(event) ?? []
            current.push(handler)
            listeners.set(event, current)
            return socket
        },
        off(event: string, handler: SocketListener) {
            const current = listeners.get(event) ?? []
            listeners.set(
                event,
                current.filter((entry) => entry !== handler)
            )
            return socket
        },
        emit(event: string, ...args: SocketArgs) {
            socket.emitCalls.push({ event, args })
            const handlers = listeners.get(event) ?? []
            for (const handler of handlers) {
                handler(...args)
            }
        },
        emitWithAck: vi.fn(async () => ({ result: 'success' })),
        connect: vi.fn(),
        disconnect: vi.fn(),
        timeout: vi.fn(() => ({
            emitWithAck: vi.fn(async () => undefined),
        })),
    }
    return socket
}

export function createRecoveredMessage(seq: number) {
    return {
        id: `message-${seq}`,
        seq,
        localId: null,
        content: {
            role: 'user',
            content: {
                type: 'text',
                text: `message ${seq}`,
            },
        },
        createdAt: seq * 1_000,
    }
}

export function createRecoveredPage(options: {
    afterSeq: number
    nextAfterSeq: number
    hasMore: boolean
    messageSeqs: number[]
}) {
    return {
        session: {
            id: 'session-1',
            seq: options.nextAfterSeq,
            createdAt: 1,
            updatedAt: options.nextAfterSeq * 1_000,
            active: true,
            activeAt: options.nextAfterSeq * 1_000,
            metadata: null,
            metadataVersion: 0,
            agentState: null,
            agentStateVersion: 0,
            thinking: false,
            thinkingAt: 0,
            model: null,
            modelReasoningEffort: null,
            permissionMode: 'default',
            collaborationMode: 'default',
        },
        messages: options.messageSeqs.map(createRecoveredMessage),
        page: {
            afterSeq: options.afterSeq,
            nextAfterSeq: options.nextAfterSeq,
            limit: 200,
            hasMore: options.hasMore,
        },
    }
}

export function createSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: null,
        metadataVersion: 0,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        model: null,
        modelReasoningEffort: null,
        permissionMode: 'default',
        collaborationMode: 'default',
        ...overrides,
    }
}

export function getLatestSessionAlivePayload(socket: FakeSocket): Record<string, unknown> | undefined {
    const call = [...socket.emitCalls].reverse().find((entry) => entry.event === 'session-alive')
    return call?.args[0] as Record<string, unknown> | undefined
}

export function createAuthResponse(token = 'web-jwt') {
    const response: AuthResponse = {
        data: {
            token,
            user: {
                id: 1,
            },
        },
        headers: {},
    }
    return response
}

export function createUnauthorizedAxiosError(): Error & {
    isAxiosError: true
    response: {
        status: number
        data: Record<string, unknown>
        headers: Record<string, string>
    }
} {
    return Object.assign(new Error('Request failed with status code 401'), {
        isAxiosError: true as const,
        response: {
            status: 401,
            data: {},
            headers: {},
        },
    })
}

export type { RecoveryState, Session }
