import type { SessionStreamState, SyncEvent, WebSubscription, WebVisibilityState } from '@viby/protocol'
import type { BroadcastOperator, DefaultEventsMap, Namespace } from 'socket.io'
import type { SocketData, SocketWithData } from './socketTypes'

const WEB_ALL_ROOM = 'web:all'
type NormalizedWebSubscription = {
    all: boolean
    sessionId: string | null
    machineId: string | null
    pushEndpoint: string | null
}

function getSessionRoom(sessionId: string): string {
    return `web:session:${sessionId}`
}

function getMachineRoom(machineId: string): string {
    return `web:machine:${machineId}`
}

function normalizeSubscription(subscription: WebSubscription): NormalizedWebSubscription {
    return {
        all: subscription.all === true,
        sessionId: subscription.sessionId?.trim() || null,
        machineId: subscription.machineId?.trim() || null,
        pushEndpoint: subscription.pushEndpoint?.trim() || null,
    }
}

function matchesSessionScope(subscription: NormalizedWebSubscription | undefined, sessionId: string): boolean {
    if (!subscription) {
        return false
    }

    return subscription.all || subscription.sessionId === sessionId
}

export class WebRealtimeManager {
    private readonly visibleSocketIds = new Set<string>()

    constructor(
        private readonly namespace: Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>,
        private readonly readSessionStream?: (sessionId: string) => SessionStreamState | null
    ) {}

    subscribe(socket: SocketWithData, subscription: WebSubscription): void {
        const next = normalizeSubscription(subscription)
        const previous = socket.data.webSubscription
        if (previous) {
            this.leaveRooms(socket, previous)
        }
        this.joinRooms(socket, next)
        socket.data.webSubscription = next
        this.emitSessionStreamSnapshot(socket, next)
    }

    setVisibility(socket: SocketWithData, visibility: WebVisibilityState): void {
        if (visibility === 'visible') {
            this.visibleSocketIds.add(socket.id)
            return
        }
        this.visibleSocketIds.delete(socket.id)
    }

    clearSocket(socketId: string): void {
        this.visibleSocketIds.delete(socketId)
    }

    getSessionStream(sessionId: string): SessionStreamState | null {
        if (!this.readSessionStream) {
            return null
        }

        return this.readSessionStream(sessionId)
    }

    async sendToast(event: Extract<SyncEvent, { type: 'toast' }>): Promise<string[]> {
        const suppressedPushEndpoints = new Set<string>()
        const sessionId = event.data.sessionId
        for (const socketId of Array.from(this.visibleSocketIds)) {
            const socket = this.namespace.sockets.get(socketId)
            if (!socket) {
                this.visibleSocketIds.delete(socketId)
                continue
            }
            if (!matchesSessionScope(socket.data.webSubscription, sessionId)) {
                continue
            }
            socket.emit('sync:event', event)
            const pushEndpoint = socket.data.webSubscription?.pushEndpoint
            if (pushEndpoint) {
                suppressedPushEndpoints.add(pushEndpoint)
            }
        }
        return Array.from(suppressedPushEndpoints)
    }

    broadcast(event: SyncEvent): void {
        const operator = this.resolveBroadcastOperator(event)
        operator.emit('sync:event', event)
    }

    private joinRooms(socket: SocketWithData, subscription: NormalizedWebSubscription): void {
        if (subscription.all) {
            socket.join(WEB_ALL_ROOM)
        }
        if (subscription.sessionId) {
            socket.join(getSessionRoom(subscription.sessionId))
        }
        if (subscription.machineId) {
            socket.join(getMachineRoom(subscription.machineId))
        }
    }

    private leaveRooms(socket: SocketWithData, subscription: NormalizedWebSubscription): void {
        if (subscription.all) {
            socket.leave(WEB_ALL_ROOM)
        }
        if (subscription.sessionId) {
            socket.leave(getSessionRoom(subscription.sessionId))
        }
        if (subscription.machineId) {
            socket.leave(getMachineRoom(subscription.machineId))
        }
    }

    private emitSessionStreamSnapshot(socket: SocketWithData, subscription: NormalizedWebSubscription): void {
        if (!subscription.sessionId || !this.readSessionStream) {
            return
        }

        const stream = this.readSessionStream(subscription.sessionId)
        if (!stream) {
            return
        }

        socket.emit('sync:event', {
            type: 'session-stream-updated',
            sessionId: subscription.sessionId,
            stream,
        })
    }

    private resolveBroadcastOperator(event: SyncEvent): BroadcastOperator<DefaultEventsMap, SocketData> {
        let operator = this.namespace.to(WEB_ALL_ROOM)
        if ('sessionId' in event) {
            operator = operator.to(getSessionRoom(event.sessionId))
        }
        if ('machineId' in event) {
            operator = operator.to(getMachineRoom(event.machineId))
        }
        return operator
    }
}
