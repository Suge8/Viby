import {
    type PairingParticipantRecord,
    type PairingRole,
    type PairingSessionRecord,
    PairingSessionRecordSchema,
} from '@viby/protocol/pairing'
import {
    cloneReconnectChallenge,
    cloneSession,
    expireIfNeeded,
    isActiveState,
    type PairingTokenIndex,
    reconnectChallengeKey,
    updateParticipant,
    updateState,
} from './storeSupport'
import type { PairingReconnectChallengeRecord, PairingStore } from './storeTypes'

const RECONNECT_CHALLENGE_ROLES: readonly PairingRole[] = ['host', 'guest']
type ConnectionUpdateMode = 'connected' | 'touched' | 'disconnected'

export class MemoryPairingStore implements PairingStore {
    private readonly sessions = new Map<string, PairingSessionRecord>()
    private readonly tokenIndex = new Map<string, PairingTokenIndex>()
    private readonly reconnectChallenges = new Map<string, PairingReconnectChallengeRecord>()

    constructor(private readonly now: () => number = Date.now) {}

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
        if (!session || !isActiveState(session.state)) {
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

    async markConnected(pairingId: string, role: PairingRole, at: number): Promise<PairingSessionRecord | null> {
        return this.updateConnection(pairingId, role, at, 'connected')
    }

    async touchConnection(pairingId: string, role: PairingRole, at: number): Promise<PairingSessionRecord | null> {
        return this.updateConnection(pairingId, role, at, 'touched')
    }

    async markDisconnected(pairingId: string, role: PairingRole, at: number): Promise<PairingSessionRecord | null> {
        return this.updateConnection(pairingId, role, at, 'disconnected')
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
        this.sessions.set(pairingId, next)
        return cloneSession(next)
    }

    private buildConnectionPatch(
        at: number,
        mode: ConnectionUpdateMode
    ): Partial<Pick<PairingParticipantRecord, 'connectedAt' | 'lastSeenAt'>> {
        switch (mode) {
            case 'connected':
                return { connectedAt: at, lastSeenAt: at }
            case 'disconnected':
                return { connectedAt: undefined, lastSeenAt: at }
            default:
                return { lastSeenAt: at }
        }
    }

    async updateConnection(
        pairingId: string,
        role: PairingRole,
        at: number,
        mode: ConnectionUpdateMode
    ): Promise<PairingSessionRecord | null> {
        const session = this.sessions.get(pairingId)
        if (!session) {
            return null
        }

        const normalized = expireIfNeeded(session, this.now(), this.tokenIndex)
        if (!isActiveState(normalized.state)) {
            this.sessions.set(pairingId, normalized)
            return null
        }

        const updated = updateState({
            ...updateParticipant(normalized, role, this.buildConnectionPatch(at, mode)),
            updatedAt: at,
        })

        this.sessions.set(pairingId, updated)
        return cloneSession(updated)
    }
}
