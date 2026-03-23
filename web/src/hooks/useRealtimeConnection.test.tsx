import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PropsWithChildren } from 'react'
import { useRealtimeConnection } from '@/hooks/useRealtimeConnection'

type SocketEventHandler = (...args: any[]) => void

class FakeSocket {
    auth: Record<string, unknown> = {}
    connected = true
    recovered = false
    disconnectCalls = 0
    connectCalls = 0
    io = { engine: { transport: { name: 'websocket' } } }
    readonly handlers = new Map<string, SocketEventHandler[]>()
    readonly emitted: Array<{ event: string; payload: unknown }> = []

    on(event: string, handler: SocketEventHandler): this {
        const existing = this.handlers.get(event) ?? []
        existing.push(handler)
        this.handlers.set(event, existing)
        return this
    }

    emit(event: string, payload: unknown): boolean {
        this.emitted.push({ event, payload })
        return true
    }

    disconnect(): this {
        this.disconnectCalls += 1
        this.connected = false
        return this
    }

    connect(): this {
        this.connectCalls += 1
        this.connected = true
        return this
    }
}

const { sockets, ioMock } = vi.hoisted(() => {
    const hoistedSockets: FakeSocket[] = []
    const hoistedIoMock = vi.fn((_url: string, options?: Record<string, unknown>) => {
        const socket = new FakeSocket()
        socket.auth = (options?.auth as Record<string, unknown> | undefined) ?? {}
        hoistedSockets.push(socket)
        return socket
    })

    return {
        sockets: hoistedSockets,
        ioMock: hoistedIoMock,
    }
})

vi.mock('socket.io-client', () => ({
    io: ioMock,
}))

function createWrapper() {
    const queryClient = new QueryClient()

    return function Wrapper(props: PropsWithChildren) {
        return (
            <QueryClientProvider client={queryClient}>
                {props.children}
            </QueryClientProvider>
        )
    }
}

afterEach(() => {
    sockets.length = 0
    ioMock.mockClear()
})

describe('useRealtimeConnection', () => {
    it('keeps the existing socket across token refresh and updates auth in place', async () => {
        const wrapper = createWrapper()

        const { rerender } = renderHook((props: { token: string }) => useRealtimeConnection({
            enabled: true,
            token: props.token,
            baseUrl: 'http://hub.test',
            subscription: { all: true },
            onEvent: () => {},
            onConnect: () => {},
        }), {
            initialProps: { token: 'token-1' },
            wrapper,
        })

        await waitFor(() => {
            expect(ioMock).toHaveBeenCalledTimes(1)
        })

        const socket = sockets[0]
        expect(socket).toBeDefined()
        expect(ioMock).toHaveBeenCalledTimes(1)
        expect(ioMock).toHaveBeenCalledWith('http://hub.test/web', expect.objectContaining({
            path: '/socket.io/',
            transports: ['polling', 'websocket'],
            autoConnect: false,
            timeout: 10_000,
        }))

        rerender({ token: 'token-2' })

        expect(ioMock).toHaveBeenCalledTimes(1)
        expect(socket?.disconnectCalls).toBe(0)
        expect(socket?.auth).toEqual({ token: 'token-2' })
    })

    it('actively reconnects when the page becomes visible again', async () => {
        const wrapper = createWrapper()

        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => 'visible'
        })

        renderHook(() => useRealtimeConnection({
            enabled: true,
            token: 'token-1',
            baseUrl: 'http://hub.test',
            subscription: { all: true },
            onEvent: () => {},
            onConnect: () => {},
        }), {
            wrapper,
        })

        await waitFor(() => {
            expect(ioMock).toHaveBeenCalledTimes(1)
        })

        const socket = sockets[0]
        expect(socket).toBeDefined()
        if (!socket) {
            return
        }

        expect(socket.connectCalls).toBe(1)
        socket.connected = false
        window.dispatchEvent(new Event('pageshow'))

        expect(socket.connectCalls).toBe(2)
    })

    it('includes the current push endpoint when subscribing after connect', async () => {
        const wrapper = createWrapper()

        renderHook(() => useRealtimeConnection({
            enabled: true,
            token: 'token-1',
            baseUrl: 'http://hub.test',
            subscription: { sessionId: 'session-1' },
            pushEndpoint: 'https://push.example.com/device-1',
            onEvent: () => {},
            onConnect: () => {},
        }), {
            wrapper,
        })

        await waitFor(() => {
            expect(ioMock).toHaveBeenCalledTimes(1)
        })

        const socket = sockets[0]
        expect(socket).toBeDefined()
        if (!socket) {
            return
        }

        const connectHandlers = socket.handlers.get('connect') ?? []
        expect(connectHandlers).toHaveLength(1)
        connectHandlers[0]?.()

        expect(socket.emitted).toContainEqual({
            event: 'web:subscribe',
            payload: {
                sessionId: 'session-1',
                pushEndpoint: 'https://push.example.com/device-1'
            }
        })
    })
})
