import { describe, expect, it } from 'bun:test'
import type { SyncEvent } from '@viby/protocol/types'
import type { SocketData, SocketWithData } from './socketTypes'
import { WebRealtimeManager } from './webRealtimeManager'

type EmittedEvent = {
    event: string
    data: unknown
}

class FakeSocket {
    readonly emitted: EmittedEvent[] = []
    readonly joinedRooms = new Set<string>()
    readonly leftRooms = new Set<string>()
    readonly data: SocketData = {}

    constructor(readonly id: string) {}

    emit(event: string, data: unknown): boolean {
        this.emitted.push({ event, data })
        return true
    }

    join(room: string): void {
        this.joinedRooms.add(room)
        this.leftRooms.delete(room)
    }

    leave(room: string): void {
        this.joinedRooms.delete(room)
        this.leftRooms.add(room)
    }
}

class FakeBroadcastOperator {
    constructor(
        private readonly namespace: FakeNamespace,
        private readonly rooms: Set<string>
    ) {}

    to(room: string): FakeBroadcastOperator {
        const nextRooms = new Set(this.rooms)
        nextRooms.add(room)
        return new FakeBroadcastOperator(this.namespace, nextRooms)
    }

    emit(event: string, data: unknown): void {
        this.namespace.broadcast(this.rooms, event, data)
    }
}

class FakeNamespace {
    readonly sockets = new Map<string, FakeSocket>()

    to(room: string): FakeBroadcastOperator {
        return new FakeBroadcastOperator(this, new Set([room]))
    }

    broadcast(rooms: Set<string>, event: string, data: unknown): void {
        for (const socket of this.sockets.values()) {
            const isTargeted = Array.from(rooms).some((room) => socket.joinedRooms.has(room))
            if (!isTargeted) {
                continue
            }
            socket.emit(event, data)
        }
    }
}

function lastEvent(socket: FakeSocket): EmittedEvent | undefined {
    return socket.emitted.at(-1)
}

describe('WebRealtimeManager', () => {
    it('routes session-scoped events only to matching subscribed sockets', () => {
        const namespace = new FakeNamespace()
        const manager = new WebRealtimeManager(namespace as never)
        const alpha = new FakeSocket('alpha')
        const beta = new FakeSocket('beta')
        namespace.sockets.set(alpha.id, alpha)
        namespace.sockets.set(beta.id, beta)

        manager.subscribe(alpha as unknown as SocketWithData, { sessionId: 's1' })
        manager.subscribe(beta as unknown as SocketWithData, { sessionId: 's2' })

        manager.broadcast({ type: 'session-updated', sessionId: 's1' })

        expect(alpha.emitted).toHaveLength(1)
        expect(beta.emitted).toHaveLength(0)
        expect(lastEvent(alpha)?.event).toBe('sync:event')
    })

    it('delivers all-scoped events to sockets subscribed to all sessions', () => {
        const namespace = new FakeNamespace()
        const manager = new WebRealtimeManager(namespace as never)
        const alpha = new FakeSocket('alpha')
        const beta = new FakeSocket('beta')
        namespace.sockets.set(alpha.id, alpha)
        namespace.sockets.set(beta.id, beta)

        manager.subscribe(alpha as unknown as SocketWithData, { all: true })
        manager.subscribe(beta as unknown as SocketWithData, { all: true })

        const event: SyncEvent = { type: 'machine-updated', machineId: 'm1' }
        manager.broadcast(event)

        expect(alpha.emitted).toHaveLength(1)
        expect(beta.emitted).toHaveLength(1)
        expect(lastEvent(alpha)?.data).toEqual(event)
        expect(lastEvent(beta)?.data).toEqual(event)
    })

    it('sends toast only to visible sockets subscribed to the matching session and returns their push endpoints', async () => {
        const namespace = new FakeNamespace()
        const manager = new WebRealtimeManager(namespace as never)
        const visible = new FakeSocket('visible')
        const hidden = new FakeSocket('hidden')
        const otherSession = new FakeSocket('other-session')
        namespace.sockets.set(visible.id, visible)
        namespace.sockets.set(hidden.id, hidden)
        namespace.sockets.set(otherSession.id, otherSession)

        manager.subscribe(visible as unknown as SocketWithData, {
            sessionId: 's1',
            pushEndpoint: 'endpoint-visible',
        })
        manager.subscribe(hidden as unknown as SocketWithData, {
            sessionId: 's1',
            pushEndpoint: 'endpoint-hidden',
        })
        manager.subscribe(otherSession as unknown as SocketWithData, {
            sessionId: 's2',
            pushEndpoint: 'endpoint-other',
        })
        manager.setVisibility(visible as unknown as SocketWithData, 'visible')
        manager.setVisibility(hidden as unknown as SocketWithData, 'hidden')
        manager.setVisibility(otherSession as unknown as SocketWithData, 'visible')

        const event: Extract<SyncEvent, { type: 'toast' }> = {
            type: 'toast',
            data: {
                title: 'Ready',
                body: 'Toast body',
                sessionId: 's1',
                url: '/sessions/s1',
            },
        }

        const suppressedPushEndpoints = await manager.sendToast(event)

        expect(suppressedPushEndpoints).toEqual(['endpoint-visible'])
        expect(visible.emitted).toHaveLength(1)
        expect(hidden.emitted).toHaveLength(0)
        expect(otherSession.emitted).toHaveLength(0)
        expect(lastEvent(visible)?.data).toEqual(event)
    })

    it('replays the current session stream snapshot when a socket subscribes to that session', () => {
        const namespace = new FakeNamespace()
        const manager = new WebRealtimeManager(namespace as never, (sessionId) => {
            if (sessionId !== 's1') {
                return null
            }

            return {
                assistantTurnId: 'stream-1',
                startedAt: 1,
                updatedAt: 2,
                text: 'Hello',
            }
        })
        const alpha = new FakeSocket('alpha')
        namespace.sockets.set(alpha.id, alpha)

        manager.subscribe(alpha as unknown as SocketWithData, { sessionId: 's1' })

        expect(alpha.emitted).toHaveLength(1)
        expect(lastEvent(alpha)?.data).toEqual({
            type: 'session-stream-updated',
            sessionId: 's1',
            stream: {
                assistantTurnId: 'stream-1',
                startedAt: 1,
                updatedAt: 2,
                text: 'Hello',
            },
        })
    })
})
