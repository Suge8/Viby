import { type PairingRole, type PairingSessionRecord, PairingSessionRecordSchema } from '@viby/protocol/pairing'
import {
    addPairingRemoteConnection,
    approvePairingSession,
    deletePairingSession,
    expirePairingSessionIfNeeded,
} from './pairingSessionTransition'
import {
    consumeHandoffTicket,
    consumeReconnectChallenge,
    createTokenIndex,
    loadTokenIndex,
    storeHandoffTicket,
    storeReconnectChallenge,
} from './redisStoreIndexSupport'
import {
    loadGuestRemoteConnections,
    markGuestRemoteConnectionForSession,
    updateSessionWithRemoteConnection,
} from './redisStoreRemoteConnections'
import { renewRedisPairingSession } from './redisStoreRenewal'
import { loadStoredSession, ttlSecondsFromExpiry } from './redisStoreSessionSupport'
import { applyRedisPairingTransitionEffects } from './redisStoreTransitionEffects'
import { updateRedisPairingSession } from './redisStoreUpdate'
import { cloneSession, sessionKey, tokenIndexKey } from './storeSupport'
import type {
    PairingHandoffTicketRecord,
    PairingReconnectChallengeRecord,
    PairingRemoteConnectionDraft,
    PairingRemoteConnectionRecord,
    PairingStore,
    RedisPairingAdapter,
} from './storeTypes'

export { RedisClientPairingAdapter } from './redisPairingAdapter'

export class RedisPairingStore implements PairingStore {
    constructor(
        private readonly adapter: RedisPairingAdapter,
        private readonly now: () => number = Date.now
    ) {}

    async healthCheck(): Promise<void> {
        await this.adapter.ping()
    }

    async createSession(session: PairingSessionRecord): Promise<PairingSessionRecord> {
        const stored = PairingSessionRecordSchema.parse(session)
        const ttlSeconds = this.ttlSeconds(stored.expiresAt)
        const sessionSet = await this.adapter.compareAndSet(sessionKey(stored.id), null, JSON.stringify(stored), {
            ttlSeconds,
        })
        if (!sessionSet) {
            throw new Error(`Pairing session ${stored.id} already exists`)
        }

        const hostSet = await createTokenIndex({
            adapter: this.adapter,
            tokenHash: stored.host.tokenHash,
            pairingId: stored.id,
            role: 'host',
            ttlSeconds,
        })
        if (!hostSet) {
            await this.adapter.del(sessionKey(stored.id))
            throw new Error(`Pairing token index for session ${stored.id} already exists`)
        }

        return cloneSession(stored)
    }

    async getSession(pairingId: string): Promise<PairingSessionRecord | null> {
        const stored = await loadStoredSession(this.adapter, pairingId)
        if (!stored) {
            return null
        }

        const expired = expirePairingSessionIfNeeded(
            stored,
            await loadGuestRemoteConnections(this.adapter, pairingId),
            this.now()
        )
        if (expired) {
            await applyRedisPairingTransitionEffects({
                adapter: this.adapter,
                transition: expired,
                ttlSeconds: this.ttlSeconds(expired.nextSession.expiresAt),
            })
            await this.saveSession(expired.nextSession)
            return cloneSession(expired.nextSession)
        }

        return cloneSession(stored)
    }

    async getSessionByTokenHash(
        tokenHash: string
    ): Promise<{ connectionId?: string; session: PairingSessionRecord; role: PairingRole } | null> {
        const index = await loadTokenIndex(this.adapter, tokenHash)
        if (!index) {
            return null
        }

        const session = await this.getSession(index.pairingId)
        if (!session || session.state === 'expired') {
            await this.adapter.del(tokenIndexKey(tokenHash))
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
        return await updateSessionWithRemoteConnection({
            adapter: this.adapter,
            now: this.now,
            pairingId,
            ttlSeconds: (expiresAt) => this.ttlSeconds(expiresAt),
            mutate: async (current) =>
                approvePairingSession({ at, connection, device, providedCode, session: current }),
        })
    }

    async renewSession(pairingId: string, expiresAt: number, at: number): Promise<PairingSessionRecord | null> {
        return await renewRedisPairingSession({
            adapter: this.adapter,
            pairingId,
            expiresAt,
            at,
            ttlSeconds: (expiresAt) => this.ttlSeconds(expiresAt),
            updateSession: (pairingId, mutate) => this.updateSession(pairingId, mutate),
        })
    }

    async addRemoteConnection(
        pairingId: string,
        connection: PairingRemoteConnectionDraft,
        at: number
    ): Promise<PairingSessionRecord | null> {
        return await updateSessionWithRemoteConnection({
            adapter: this.adapter,
            now: this.now,
            pairingId,
            ttlSeconds: (expiresAt) => this.ttlSeconds(expiresAt),
            mutate: async (current) => addPairingRemoteConnection({ at, connection, session: current }),
        })
    }

    async getRemoteConnections(pairingId: string): Promise<PairingRemoteConnectionRecord[]> {
        return await loadGuestRemoteConnections(this.adapter, pairingId)
    }

    async markRemoteConnectionConnected(pairingId: string, connectionId: string, at: number): Promise<void> {
        await this.markRemoteConnection(pairingId, connectionId, at, true)
    }

    async markRemoteConnectionDisconnected(pairingId: string, connectionId: string, at: number): Promise<void> {
        await this.markRemoteConnection(pairingId, connectionId, at, false)
    }

    private async markRemoteConnection(
        pairingId: string,
        connectionId: string,
        at: number,
        connected: boolean
    ): Promise<void> {
        await markGuestRemoteConnectionForSession({
            adapter: this.adapter,
            pairingId,
            connectionId,
            at,
            connected,
            getExpiresAt: async (pairingId) => (await this.getSession(pairingId))?.expiresAt ?? null,
            ttlSeconds: (expiresAt) => this.ttlSeconds(expiresAt),
        })
    }

    async issueReconnectChallenge(
        pairingId: string,
        role: PairingRole,
        challenge: PairingReconnectChallengeRecord
    ): Promise<PairingReconnectChallengeRecord> {
        return await storeReconnectChallenge({
            adapter: this.adapter,
            pairingId,
            role,
            challenge,
            ttlSeconds: this.ttlSeconds(challenge.expiresAt),
        })
    }

    async consumeReconnectChallenge(pairingId: string, role: PairingRole, nonce: string, at: number): Promise<boolean> {
        return await consumeReconnectChallenge({
            adapter: this.adapter,
            pairingId,
            role,
            nonce,
            at,
        })
    }

    async issueHandoffTicket(
        pairingId: string,
        ticket: PairingHandoffTicketRecord
    ): Promise<PairingHandoffTicketRecord> {
        return await storeHandoffTicket({
            adapter: this.adapter,
            pairingId,
            ticket,
            ttlSeconds: this.ttlSeconds(ticket.expiresAt),
        })
    }

    async consumeHandoffTicket(pairingId: string, tokenHash: string, at: number): Promise<boolean> {
        return await consumeHandoffTicket({
            adapter: this.adapter,
            pairingId,
            tokenHash,
            at,
        })
    }

    async deleteSession(pairingId: string, at: number): Promise<PairingSessionRecord | null> {
        const stored = await loadStoredSession(this.adapter, pairingId)
        if (!stored) return null

        const deleted = deletePairingSession(stored, await loadGuestRemoteConnections(this.adapter, pairingId), at)
        await applyRedisPairingTransitionEffects({
            adapter: this.adapter,
            transition: deleted,
            ttlSeconds: this.ttlSeconds(deleted.nextSession.expiresAt),
        })
        await this.saveSession(deleted.nextSession)
        return cloneSession(deleted.nextSession)
    }

    async updateSession(
        pairingId: string,
        mutate: (session: PairingSessionRecord) => Promise<PairingSessionRecord | null>
    ): Promise<PairingSessionRecord | null> {
        return await updateRedisPairingSession({
            adapter: this.adapter,
            now: this.now,
            pairingId,
            ttlSeconds: (expiresAt) => this.ttlSeconds(expiresAt),
            mutate,
        })
    }

    async saveSession(session: PairingSessionRecord): Promise<void> {
        await this.adapter.set(sessionKey(session.id), JSON.stringify(session), {
            ttlSeconds: this.ttlSeconds(session.expiresAt),
        })
    }

    ttlSeconds(expiresAt: number): number {
        return ttlSecondsFromExpiry(expiresAt, this.now)
    }
}
