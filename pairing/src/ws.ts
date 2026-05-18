import { PairingBrokerSignalMessageSchema, type PairingByeReason } from '@viby/protocol/pairing'
import { buildPairingConnectionKey, PairingConnectionIndex } from './wsConnectionIndex'
import { createPairingDisconnectGrace } from './wsDisconnectGrace'
import {
    flushPendingSocketMessages,
    PairingPendingSocketMessages,
    sendOrBufferSocketMessage,
} from './wsPendingMessages'
import { snapshotPairingSocketHub } from './wsSnapshot'
import { createEmptyState, oppositeRole, parseSocketMessage, readRawText, sendBye } from './wsSupport'
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
            onExpire: (connection) => this.collectEmptySession(connection.pairingId),
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
        this.disconnectGrace.cancel(state, identity.role)
        const existing = state.sockets.get(identity.role)
        if (existing && existing !== socket) {
            this.connectionIndex.deleteSocket(existing)
            existing.close(1012, 'replaced')
        }

        const connection = {
            connectionKey: buildPairingConnectionKey(pairingId, identity.role, tokenHash),
            pairingId,
            role: identity.role,
            tokenHash,
            socket,
        }
        state.sockets.set(identity.role, socket)
        this.connectionIndex.set(socket, connection)
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
            socket.close(1003, 'invalid-message')
            return
        }
        const targetRole = oppositeRole(connection.role)
        sendOrBufferSocketMessage({
            bufferMessages: this.options.bufferMessages,
            connection,
            pendingMessages: this.pendingMessages,
            rawText,
            shouldBufferMessage: this.options.shouldBufferMessage,
            target: this.connections.get(connection.pairingId)?.sockets.get(targetRole),
            targetRole,
        })
    }

    async detach(socket: PairingSocketLike): Promise<void> {
        const connection = this.connectionIndex.resolve(socket)
        if (!connection) return
        this.connectionIndex.deleteSocket(socket)
        const state = this.connections.get(connection.pairingId)
        if (!state || state.sockets.get(connection.role) !== connection.socket) return
        state.sockets.delete(connection.role)
        this.disconnectGrace.schedule(state, connection)
    }

    async notifyBye(pairingId: string, reason: PairingByeReason): Promise<void> {
        const state = this.connections.get(pairingId)
        if (!state) return
        this.connectionIndex.deleteSession(pairingId, state.sockets.values())
        for (const socket of state.sockets.values()) {
            sendBye(socket, reason)
            socket.close(1000, reason)
        }
        this.disconnectGrace.clearAll(state)
        state.sockets.clear()
        this.connections.delete(pairingId)
        this.pendingMessages.deleteSession(pairingId)
    }

    snapshot(): PairingSocketHubSnapshot {
        return snapshotPairingSocketHub(this.connections.values(), this.connections.size)
    }

    private collectEmptySession(pairingId: string): void {
        const state = this.connections.get(pairingId)
        if (state && state.sockets.size === 0 && state.disconnectTimers.size === 0) {
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
}
