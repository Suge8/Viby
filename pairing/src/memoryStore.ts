import { type PairingRole, type PairingSessionRecord, PairingSessionRecordSchema } from '@viby/protocol/pairing'
import {
    addPairingRemoteConnection,
    approvePairingSession,
    deletePairingSession,
    expirePairingSessionIfNeeded,
    type PairingSessionTransition,
    renewPairingSession,
} from './pairingSessionTransition'
import {
    cloneHandoffTicket,
    cloneReconnectChallenge,
    cloneSession,
    handoffTicketKey,
    type PairingTokenIndex,
    reconnectChallengeKey,
} from './storeSupport'
import type {
    PairingHandoffTicketRecord,
    PairingReconnectChallengeRecord,
    PairingRemoteConnectionDraft,
    PairingRemoteConnectionRecord,
    PairingStore,
} from './storeTypes'

const RECONNECT_CHALLENGE_ROLES: readonly PairingRole[] = ['host', 'guest']

export class MemoryPairingStore implements PairingStore {
    private readonly sessions = new Map<string, PairingSessionRecord>()
    private readonly tokenIndex = new Map<string, PairingTokenIndex>()
    private readonly reconnectChallenges = new Map<string, PairingReconnectChallengeRecord>()
    private readonly handoffTickets = new Map<string, PairingHandoffTicketRecord>()
    private readonly remoteConnections = new Map<string, Map<string, PairingRemoteConnectionRecord>>()

    constructor(private readonly now: () => number = Date.now) {}

    async healthCheck(): Promise<void> {}

    private clearReconnectChallenges(pairingId: string): void {
        for (const role of RECONNECT_CHALLENGE_ROLES) {
            this.reconnectChallenges.delete(reconnectChallengeKey(pairingId, role))
        }
    }

    private clearHandoffTickets(pairingId: string): void {
        const prefix = `${handoffTicketKey(pairingId)}:`
        this.handoffTickets.delete(handoffTicketKey(pairingId))
        for (const key of this.handoffTickets.keys()) {
            if (key.startsWith(prefix)) this.handoffTickets.delete(key)
        }
    }

    private getRemoteConnectionList(pairingId: string): PairingRemoteConnectionRecord[] {
        return [...(this.remoteConnections.get(pairingId)?.values() ?? [])]
    }

    private applyTransition(transition: PairingSessionTransition): PairingSessionRecord {
        for (const op of transition.tokenIndexOps) {
            if (op.type === 'delete') this.tokenIndex.delete(op.tokenHash)
            else this.tokenIndex.set(op.tokenHash, op.value)
        }
        for (const op of transition.remoteConnectionOps) {
            if (op.type === 'clear-all') {
                for (const connection of this.remoteConnections.get(op.pairingId)?.values() ?? []) {
                    this.tokenIndex.delete(connection.tokenHash)
                }
                this.remoteConnections.delete(op.pairingId)
                continue
            }
            const connections = new Map<string, PairingRemoteConnectionRecord>()
            connections.set(op.connection.id, { ...op.connection })
            this.remoteConnections.set(op.connection.pairingId, connections)
        }
        for (const op of transition.transientOps) {
            this.clearReconnectChallenges(op.pairingId)
            this.clearHandoffTickets(op.pairingId)
        }
        this.sessions.set(transition.nextSession.id, transition.nextSession)
        return transition.nextSession
    }

    async createSession(session: PairingSessionRecord): Promise<PairingSessionRecord> {
        const stored = cloneSession(PairingSessionRecordSchema.parse(session))
        this.sessions.set(stored.id, stored)
        this.tokenIndex.set(stored.host.tokenHash, { pairingId: stored.id, role: 'host' })
        return cloneSession(stored)
    }

    async getSession(pairingId: string): Promise<PairingSessionRecord | null> {
        const session = this.sessions.get(pairingId)
        if (!session) {
            return null
        }

        const expired = expirePairingSessionIfNeeded(session, this.getRemoteConnectionList(pairingId), this.now())
        const current = expired ? this.applyTransition(expired) : session

        return cloneSession(current)
    }

    async getSessionByTokenHash(
        tokenHash: string
    ): Promise<{ connectionId?: string; session: PairingSessionRecord; role: PairingRole } | null> {
        const index = this.tokenIndex.get(tokenHash)
        if (!index) {
            return null
        }

        const session = await this.getSession(index.pairingId)
        if (!session || session.state === 'expired') {
            this.tokenIndex.delete(tokenHash)
            return null
        }

        return { connectionId: index.connectionId, session, role: index.role }
    }

    async verifyCodeAndApprove(
        pairingId: string,
        providedCode: string,
        device: PairingSessionRecord['authorizedDevice'],
        connection: PairingRemoteConnectionDraft,
        at: number
    ): Promise<PairingSessionRecord | null> {
        const session = this.sessions.get(pairingId)
        if (!session) return null

        const expired = expirePairingSessionIfNeeded(session, this.getRemoteConnectionList(pairingId), this.now())
        const current = expired ? this.applyTransition(expired) : session
        if (expired) return null

        const approved = approvePairingSession({ at, connection, device, providedCode, session: current })
        return approved ? cloneSession(this.applyTransition(approved)) : null
    }

    async renewSession(pairingId: string, expiresAt: number, at: number): Promise<PairingSessionRecord | null> {
        const session = this.sessions.get(pairingId)
        if (!session) {
            return null
        }

        const expired = expirePairingSessionIfNeeded(session, this.getRemoteConnectionList(pairingId), this.now())
        const current = expired ? this.applyTransition(expired) : session
        if (expired) return null

        const renewed = renewPairingSession(current, expiresAt, at)
        return renewed ? cloneSession(this.applyTransition(renewed)) : null
    }

    async addRemoteConnection(
        pairingId: string,
        connection: PairingRemoteConnectionDraft,
        at: number
    ): Promise<PairingSessionRecord | null> {
        const session = this.sessions.get(pairingId)
        if (!session) return null

        const expired = expirePairingSessionIfNeeded(session, this.getRemoteConnectionList(pairingId), this.now())
        const current = expired ? this.applyTransition(expired) : session
        if (expired) return null

        const added = addPairingRemoteConnection({ at, connection, session: current })
        return added ? cloneSession(this.applyTransition(added)) : null
    }

    async getRemoteConnections(pairingId: string): Promise<PairingRemoteConnectionRecord[]> {
        return this.getRemoteConnectionList(pairingId).map((connection) => ({ ...connection }))
    }

    async markRemoteConnectionConnected(pairingId: string, connectionId: string, at: number): Promise<void> {
        this.updateRemoteConnection(pairingId, connectionId, (connection) => ({
            ...connection,
            connectedAt: at,
            lastSeenAt: at,
        }))
    }

    async markRemoteConnectionDisconnected(pairingId: string, connectionId: string, at: number): Promise<void> {
        this.updateRemoteConnection(pairingId, connectionId, (connection) => ({
            ...connection,
            connectedAt: undefined,
            lastSeenAt: at,
        }))
    }

    private updateRemoteConnection(
        pairingId: string,
        connectionId: string,
        update: (connection: PairingRemoteConnectionRecord) => PairingRemoteConnectionRecord
    ): void {
        const connections = this.remoteConnections.get(pairingId)
        const connection = connections?.get(connectionId)
        if (!connections || !connection) return
        connections.set(connectionId, update(connection))
    }

    async issueReconnectChallenge(
        pairingId: string,
        role: PairingRole,
        challenge: PairingReconnectChallengeRecord
    ): Promise<PairingReconnectChallengeRecord> {
        this.reconnectChallenges.set(reconnectChallengeKey(pairingId, role), cloneReconnectChallenge(challenge))
        return cloneReconnectChallenge(challenge)
    }

    async consumeReconnectChallenge(pairingId: string, role: PairingRole, nonce: string, at: number): Promise<boolean> {
        const key = reconnectChallengeKey(pairingId, role)
        const challenge = this.reconnectChallenges.get(key)
        if (!challenge) {
            return false
        }

        this.reconnectChallenges.delete(key)
        return challenge.nonce === nonce && at <= challenge.expiresAt
    }

    async issueHandoffTicket(
        pairingId: string,
        ticket: PairingHandoffTicketRecord
    ): Promise<PairingHandoffTicketRecord> {
        this.handoffTickets.set(handoffTicketKey(pairingId, ticket.tokenHash), cloneHandoffTicket(ticket))
        return cloneHandoffTicket(ticket)
    }

    async consumeHandoffTicket(pairingId: string, tokenHash: string, at: number): Promise<boolean> {
        const key = handoffTicketKey(pairingId, tokenHash)
        const ticket = this.handoffTickets.get(key) ?? this.handoffTickets.get(handoffTicketKey(pairingId))
        if (!ticket || ticket.tokenHash !== tokenHash || at > ticket.expiresAt) return false

        this.handoffTickets.delete(key)
        this.handoffTickets.delete(handoffTicketKey(pairingId))
        return true
    }

    async deleteSession(pairingId: string, at: number): Promise<PairingSessionRecord | null> {
        const session = this.sessions.get(pairingId)
        if (!session) {
            return null
        }

        const deleted = deletePairingSession(session, this.getRemoteConnectionList(pairingId), at)
        return cloneSession(this.applyTransition(deleted))
    }
}
