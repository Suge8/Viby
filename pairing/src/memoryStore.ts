import {
    type PairingParticipantRecord,
    type PairingRole,
    type PairingSessionRecord,
    PairingSessionRecordSchema,
} from '@viby/protocol/pairing'
import {
    cloneHandoffTicket,
    cloneReconnectChallenge,
    cloneSession,
    expireIfNeeded,
    handoffTicketKey,
    isActiveState,
    type PairingTokenIndex,
    reconnectChallengeKey,
    updateState,
} from './storeSupport'
import type { PairingHandoffTicketRecord, PairingReconnectChallengeRecord, PairingStore } from './storeTypes'

const RECONNECT_CHALLENGE_ROLES: readonly PairingRole[] = ['host', 'guest']

export class MemoryPairingStore implements PairingStore {
    private readonly sessions = new Map<string, PairingSessionRecord>()
    private readonly tokenIndex = new Map<string, PairingTokenIndex>()
    private readonly reconnectChallenges = new Map<string, PairingReconnectChallengeRecord>()
    private readonly handoffTickets = new Map<string, PairingHandoffTicketRecord>()

    constructor(private readonly now: () => number = Date.now) {}

    async healthCheck(): Promise<void> {}

    private clearReconnectChallenges(pairingId: string): void {
        for (const role of RECONNECT_CHALLENGE_ROLES) {
            this.reconnectChallenges.delete(reconnectChallengeKey(pairingId, role))
        }
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

        const normalized = expireIfNeeded(session, this.now(), this.tokenIndex)
        if (normalized !== session) {
            if (normalized.state === 'expired') {
                this.clearReconnectChallenges(pairingId)
                this.handoffTickets.delete(handoffTicketKey(pairingId))
            }
            this.sessions.set(pairingId, normalized)
        }

        return cloneSession(normalized)
    }

    async getSessionByTokenHash(
        tokenHash: string
    ): Promise<{ session: PairingSessionRecord; role: PairingRole } | null> {
        const index = this.tokenIndex.get(tokenHash)
        if (!index) {
            return null
        }

        const session = await this.getSession(index.pairingId)
        if (!session || session.state === 'expired') {
            this.tokenIndex.delete(tokenHash)
            return null
        }

        return { session, role: index.role }
    }

    async claimSession(
        pairingId: string,
        guest: PairingParticipantRecord,
        shortCode: string
    ): Promise<PairingSessionRecord | null> {
        const session = this.sessions.get(pairingId)
        if (!session || !isActiveState(session.state) || session.guest) {
            return null
        }

        const normalized = expireIfNeeded(session, this.now(), this.tokenIndex)
        if (!isActiveState(normalized.state) || normalized.guest) {
            this.sessions.set(pairingId, normalized)
            return null
        }

        const next = updateState({
            ...normalized,
            updatedAt: this.now(),
            shortCode,
            approvalStatus: 'pending',
            guest: { ...guest },
        })

        this.sessions.set(pairingId, next)
        this.tokenIndex.set(guest.tokenHash, { pairingId, role: 'guest' })
        return cloneSession(next)
    }

    async approveSession(pairingId: string, at: number): Promise<PairingSessionRecord | null> {
        const session = this.sessions.get(pairingId)
        if (!session) {
            return null
        }

        const normalized = expireIfNeeded(session, this.now(), this.tokenIndex)
        if (!isActiveState(normalized.state) || !normalized.guest || normalized.approvalStatus === 'approved') {
            this.sessions.set(pairingId, normalized)
            return normalized.guest && normalized.approvalStatus === 'approved' ? cloneSession(normalized) : null
        }

        const next = updateState({
            ...normalized,
            updatedAt: at,
            approvalStatus: 'approved',
        })

        this.sessions.set(pairingId, next)
        return cloneSession(next)
    }

    async renewSession(pairingId: string, expiresAt: number, at: number): Promise<PairingSessionRecord | null> {
        const session = this.sessions.get(pairingId)
        if (!session) {
            return null
        }

        const normalized = expireIfNeeded(session, this.now(), this.tokenIndex)
        if (!isActiveState(normalized.state)) {
            this.sessions.set(pairingId, normalized)
            return null
        }

        const renewed = { ...normalized, expiresAt: Math.max(normalized.expiresAt, expiresAt), updatedAt: at }
        this.sessions.set(pairingId, renewed)
        return cloneSession(renewed)
    }

    async bindGuestDeviceKey(pairingId: string, publicKey: string, at: number): Promise<PairingSessionRecord | null> {
        const session = this.sessions.get(pairingId)
        if (!session) return null

        const normalized = expireIfNeeded(session, this.now(), this.tokenIndex)
        const guest = normalized.guest
        if (!isActiveState(normalized.state) || !guest) {
            this.sessions.set(pairingId, normalized)
            return null
        }
        if (guest.publicKey) {
            return guest.publicKey === publicKey ? cloneSession(normalized) : null
        }

        const next = updateState({ ...normalized, updatedAt: at, guest: { ...guest, publicKey } })
        this.sessions.set(pairingId, next)
        return cloneSession(next)
    }

    async rotateGuestToken(
        pairingId: string,
        guest: PairingParticipantRecord,
        at: number
    ): Promise<PairingSessionRecord | null> {
        const session = this.sessions.get(pairingId)
        if (!session) return null

        const normalized = expireIfNeeded(session, this.now(), this.tokenIndex)
        if (!isActiveState(normalized.state) || !normalized.guest) {
            this.sessions.set(pairingId, normalized)
            return null
        }

        const next = updateState({ ...normalized, updatedAt: at, guest: { ...guest } })
        this.tokenIndex.delete(normalized.guest.tokenHash)
        this.tokenIndex.set(guest.tokenHash, { pairingId, role: 'guest' })
        this.sessions.set(pairingId, next)
        return cloneSession(next)
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
        this.handoffTickets.set(handoffTicketKey(pairingId), cloneHandoffTicket(ticket))
        return cloneHandoffTicket(ticket)
    }

    async consumeHandoffTicket(pairingId: string, tokenHash: string, at: number): Promise<boolean> {
        const key = handoffTicketKey(pairingId)
        const ticket = this.handoffTickets.get(key)
        if (!ticket) return false

        this.handoffTickets.delete(key)
        return ticket.tokenHash === tokenHash && at <= ticket.expiresAt
    }

    async deleteSession(pairingId: string, at: number): Promise<PairingSessionRecord | null> {
        const session = this.sessions.get(pairingId)
        if (!session) {
            return null
        }

        const next = {
            ...session,
            state: 'deleted' as const,
            updatedAt: at,
            approvalStatus: session.approvalStatus,
            shortCode: session.shortCode,
            host: { ...session.host, connectedAt: undefined },
            guest: session.guest ? { ...session.guest, connectedAt: undefined } : null,
        }

        this.tokenIndex.delete(session.host.tokenHash)
        if (session.guest) {
            this.tokenIndex.delete(session.guest.tokenHash)
        }
        this.clearReconnectChallenges(pairingId)
        this.handoffTickets.delete(handoffTicketKey(pairingId))
        this.sessions.set(pairingId, next)
        return cloneSession(next)
    }

}
