import { type PairingSessionRecord, type PairingSignal, PairingSignalSchema } from '@viby/protocol/pairing'
import {
    CLIENT_MESSAGE_TYPES,
    createEmptyState,
    emitError,
    emitExpired,
    emitPeerLeft,
    emitPong,
    emitReady,
    emitState,
    emitStateToSocket,
    flushPendingSignals,
    normalizeSignal,
    oppositeRole,
    queuePendingSignal,
    readRawText,
    sendSignal,
} from './wsSupport'
import type { ConnectionState, PairingConnection, PairingSocketHubOptions, PairingSocketLike } from './wsTypes'

export type { PairingConnection, PairingSocketHubOptions, PairingSocketLike } from './wsTypes'

export class PairingSocketHub {
    private readonly connections = new Map<string, ConnectionState>()
    private readonly socketIndex = new Map<PairingSocketLike, PairingConnection>()

    constructor(private readonly options: PairingSocketHubOptions) {}

    async attach(pairingId: string, tokenHash: string, socket: PairingSocketLike): Promise<PairingConnection | null> {
        const identity = await this.options.store.getSessionByTokenHash(tokenHash)
        if (!identity || identity.session.id !== pairingId) {
            socket.close(1008, 'unauthorized')
            return null
        }

        const session = identity.session
        if (session.state === 'deleted' || session.state === 'expired') {
            socket.close(1008, 'pairing-unavailable')
            return null
        }

        const state = this.getConnectionState(pairingId)
        const existing = state.sockets.get(identity.role)
        if (existing && existing !== socket) {
            existing.close(1012, 'replaced')
        }

        const connection: PairingConnection = { pairingId, role: identity.role, tokenHash, socket }
        state.sockets.set(identity.role, socket)
        this.socketIndex.set(socket, connection)

        const attached = await this.options.store.markConnected(pairingId, identity.role, this.now())
        if (attached) {
            emitState(connection, this.now(), attached)
        }
        flushPendingSignals(state, identity.role)

        if (attached && attached.state === 'connected') {
            emitReady(state, pairingId, this.now(), attached)
        }

        return connection
    }

    async handleMessage(
        socket: PairingSocketLike,
        rawData: string | ArrayBuffer | SharedArrayBuffer | Blob
    ): Promise<void> {
        const connection = this.socketIndex.get(socket)
        if (!connection) {
            socket.close(1008, 'not-attached')
            return
        }

        const rawText = await readRawText(rawData)
        if (!rawText) {
            emitError(connection, this.now(), 'invalid-payload', 'Expected a text JSON message.')
            return
        }

        let parsedSignal: ReturnType<typeof PairingSignalSchema.safeParse>
        try {
            parsedSignal = PairingSignalSchema.safeParse(JSON.parse(rawText))
        } catch {
            emitError(connection, this.now(), 'invalid-json', 'Expected JSON payload.')
            return
        }

        const parsed = parsedSignal
        if (!parsed.success) {
            emitError(connection, this.now(), 'invalid-signal', 'Signal payload did not match the pairing schema.')
            return
        }

        const signal = parsed.data
        await this.options.store.touchConnection(connection.pairingId, connection.role, this.now())

        if (!CLIENT_MESSAGE_TYPES.has(signal.type)) {
            emitError(connection, this.now(), 'invalid-client-message', `Client messages cannot use "${signal.type}".`)
            return
        }

        if (signal.type === 'ping') {
            emitPong(socket, connection.pairingId, connection.role, this.now(), signal)
            return
        }

        if (signal.type === 'join') {
            const current = await this.options.store.getSession(connection.pairingId)
            if (current) {
                emitState(connection, this.now(), current)
                if (current.state === 'connected') {
                    const state = this.getConnectionState(connection.pairingId)
                    emitReady(state, connection.pairingId, this.now(), current)
                }
            }
            return
        }

        const payload = normalizeSignal(signal, connection.pairingId, connection.role, this.now())
        this.forwardOrQueue(payload)
    }

    async detach(socket: PairingSocketLike): Promise<void> {
        const connection = this.socketIndex.get(socket)
        if (!connection) {
            return
        }

        this.socketIndex.delete(socket)
        const state = this.connections.get(connection.pairingId)
        if (!state) {
            return
        }

        const currentSocket = state.sockets.get(connection.role)
        if (currentSocket !== socket) {
            return
        }

        state.sockets.delete(connection.role)
        await this.options.store.markDisconnected(connection.pairingId, connection.role, this.now())

        const current = await this.options.store.getSession(connection.pairingId)
        const peer = state.sockets.get(oppositeRole(connection.role))
        if (current && peer && peer.readyState === 1) {
            emitPeerLeft(peer, connection.pairingId, oppositeRole(connection.role), this.now(), current)
        }

        if (state.sockets.size === 0) {
            this.connections.delete(connection.pairingId)
        }
    }

    async closeSession(
        pairingId: string,
        snapshot: PairingSessionRecord,
        reason: 'deleted' | 'expired'
    ): Promise<void> {
        const state = this.connections.get(pairingId)
        if (!state) {
            return
        }

        for (const socket of state.sockets.values()) {
            this.socketIndex.delete(socket)
        }
        emitExpired(state, pairingId, this.now(), snapshot, reason)
        state.sockets.clear()
        state.pending.get('host')?.splice(0)
        state.pending.get('guest')?.splice(0)
        this.connections.delete(pairingId)
    }

    broadcastState(pairingId: string, session: PairingSessionRecord): void {
        const state = this.connections.get(pairingId)
        if (!state) {
            return
        }

        const at = this.now()
        for (const [role, socket] of state.sockets) {
            emitStateToSocket(socket, pairingId, role, at, session)
        }

        if (session.state === 'connected') {
            emitReady(state, pairingId, at, session)
        }
    }

    private forwardOrQueue(signal: PairingSignal): void {
        const state = this.getConnectionState(signal.pairingId)
        const targetRole = signal.to ?? oppositeRole(signal.from ?? 'host')
        const targetSocket = state.sockets.get(targetRole)

        if (targetSocket && targetSocket.readyState === 1) {
            sendSignal(targetSocket, signal)
            return
        }

        queuePendingSignal(state, targetRole, signal)
    }

    private getConnectionState(pairingId: string): ConnectionState {
        const existing = this.connections.get(pairingId)
        if (existing) {
            return existing
        }

        const created = createEmptyState()
        this.connections.set(pairingId, created)
        return created
    }

    private now(): number {
        return this.options.now?.() ?? Date.now()
    }
}
