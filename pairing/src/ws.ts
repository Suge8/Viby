import { PairingBrokerSignalMessageSchema, type PairingByeReason } from '@viby/protocol/pairing'
import { PairingConnectionIndex } from './wsConnectionIndex'
import { createPairingDisconnectGrace } from './wsDisconnectGrace'
import { forwardPairingSocketMessage, getAllPairingSockets } from './wsMultiplex'
import { flushPendingSocketMessages, PairingPendingSocketMessages } from './wsPendingMessages'
import { snapshotPairingSocketHub } from './wsSnapshot'
import { attachPairingSocket, detachPairingSocket } from './wsSocketSlots'
import { createEmptyState, parseSocketMessage, readRawText, sendBye } from './wsSupport'
import type {
    ConnectionState,
    PairingConnection,
    PairingSocketHubOptions,
    PairingSocketHubSnapshot,
    PairingSocketLike,
} from './wsTypes'

export type { PairingConnection, PairingSocketHubOptions, PairingSocketLike } from './wsTypes'

export class PairingSocketHub {
    private readonly connections = new Map<string, ConnectionState>()
    private readonly connectionIndex = new PairingConnectionIndex()
    private readonly disconnectGrace
    private readonly messageSchema
    private readonly pendingMessages
    constructor(private readonly options: PairingSocketHubOptions) {
        this.messageSchema = options.messageSchema ?? PairingBrokerSignalMessageSchema
        this.pendingMessages = new PairingPendingSocketMessages(options.maxBufferedMessagesPerRole)
        this.disconnectGrace = createPairingDisconnectGrace({
            disconnectGraceMs: options.disconnectGraceMs,
            scheduleTimeout: options.scheduleTimeout,
            onExpire: (connection) => {
                this.options.metrics?.increment('stale_connection_drops')
                this.collectEmptySession(connection.pairingId)
            },
        })
    }
    async attach(pairingId: string, tokenHash: string, socket: PairingSocketLike): Promise<PairingConnection | null> {
        const identity = await this.options.store.getSessionByTokenHash(tokenHash)
        if (!identity || identity.session.id !== pairingId) {
            socket.close(1008, 'invalid_token')
            return null
        }
        if (identity.session.state === 'deleted' || identity.session.state === 'expired') {
            sendBye(socket, 'pairing_unavailable')
            socket.close(1000, 'pairing_unavailable')
            return null
        }
        const state = this.getConnectionState(pairingId)
        const previousGuestConnection =
            identity.role === 'guest' ? this.connectionIndex.resolve(state.sockets.get('guest') ?? socket) : null
        const connection = attachPairingSocket({
            identity,
            pairingId,
            socket,
            state,
            tokenHash,
            deleteIndexedSocket: (socket) => this.connectionIndex.deleteSocket(socket),
        })
        const peerReplaced =
            identity.role === 'guest' &&
            previousGuestConnection !== null &&
            previousGuestConnection.connectionId !== connection.connectionId
        this.disconnectGrace.cancel(state, connection.connectionKey)
        this.connectionIndex.set(socket, connection)
        this.trace(pairingId, 'ws.open', { role: identity.role, connectionId: connection.connectionId })
        if (peerReplaced) state.sockets.get('host')?.send(JSON.stringify({ type: 'peer-replaced' }))
        if (identity.role === 'guest' && this.options.trackRemoteConnectionLiveness !== false) {
            await this.options.store.markRemoteConnectionConnected(
                pairingId,
                connection.connectionId,
                this.options.now?.() ?? Date.now()
            )
            await this.options.onRemoteConnectionsChanged?.(pairingId)
        }
        flushPendingSocketMessages({
            bufferMessages: this.options.bufferMessages,
            pairingId,
            pendingMessages: this.pendingMessages,
            role: identity.role,
            socket,
        })
        return connection
    }
    async handleMessage(
        socket: PairingSocketLike,
        rawData: string | ArrayBuffer | SharedArrayBuffer | Blob
    ): Promise<void> {
        const connection = this.connectionIndex.resolve(socket)
        if (!connection) {
            socket.close(1008, 'not-attached')
            return
        }
        const rawText = await readRawText(rawData)
        if (!rawText) return
        if (!parseSocketMessage(rawText, this.messageSchema)) {
            this.trace(connection.pairingId, 'tunnel.frame-drop', {
                role: connection.role,
                reason: 'invalid-message',
            })
            socket.close(1003, 'invalid-message')
            return
        }
        forwardPairingSocketMessage({
            bufferMessages: this.options.bufferMessages,
            connection,
            pendingMessages: this.pendingMessages,
            rawText,
            shouldBufferMessage: this.options.shouldBufferMessage,
            state: this.connections.get(connection.pairingId),
        })
    }
    async detach(socket: PairingSocketLike): Promise<void> {
        const connection = this.connectionIndex.resolve(socket)
        if (!connection) return
        this.connectionIndex.deleteSocket(socket)
        const state = detachPairingSocket({
            connection,
            state: this.connections.get(connection.pairingId),
        })
        if (!state) return
        this.trace(connection.pairingId, 'ws.close', { role: connection.role, connectionId: connection.connectionId })
        if (connection.role === 'guest' && this.options.trackRemoteConnectionLiveness !== false) {
            await this.options.store.markRemoteConnectionDisconnected(
                connection.pairingId,
                connection.connectionId,
                this.options.now?.() ?? Date.now()
            )
            await this.options.onRemoteConnectionsChanged?.(connection.pairingId)
        }
        this.disconnectGrace.schedule(state, connection)
    }
    async notifyBye(pairingId: string, reason: PairingByeReason): Promise<void> {
        const state = this.connections.get(pairingId)
        if (!state) return
        const sockets = getAllPairingSockets(state)
        this.connectionIndex.deleteSession(pairingId, sockets)
        this.trace(pairingId, 'fatal', { reason })
        for (const socket of sockets) {
            sendBye(socket, reason)
            socket.close(1000, reason)
        }
        this.disconnectGrace.clearAll(state)
        state.sockets.clear()
        this.connections.delete(pairingId)
        this.pendingMessages.deleteSession(pairingId)
    }
    getActiveRemoteConnectionIds(pairingId: string): ReadonlySet<string> {
        const guestSocket = this.connections.get(pairingId)?.sockets.get('guest')
        const connection = guestSocket ? this.connectionIndex.resolve(guestSocket) : null
        return connection?.role === 'guest' ? new Set([connection.connectionId]) : new Set()
    }
    snapshot(): PairingSocketHubSnapshot {
        return snapshotPairingSocketHub(this.connections.entries(), this.connections.size)
    }
    private collectEmptySession(pairingId: string): void {
        const state = this.connections.get(pairingId)
        if (state && getAllPairingSockets(state).length === 0 && state.disconnectTimers.size === 0) {
            this.connections.delete(pairingId)
            this.pendingMessages.deleteSession(pairingId)
        }
    }
    private getConnectionState(pairingId: string): ConnectionState {
        const existing = this.connections.get(pairingId)
        if (existing) return existing
        const created = createEmptyState()
        this.connections.set(pairingId, created)
        return created
    }
    private trace(
        pairingId: string,
        event: Parameters<NonNullable<PairingSocketHubOptions['onTrace']>>[0]['event'],
        payloadMeta?: Parameters<NonNullable<PairingSocketHubOptions['onTrace']>>[0]['payloadMeta']
    ): void {
        this.options.onTrace?.({ pairingId, event, payloadMeta })
    }
}
