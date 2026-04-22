import {
    type PairingParticipantRecord,
    type PairingRole,
    type PairingSessionRecord,
    PairingSessionRecordSchema,
} from '@viby/protocol/pairing'
import {
    clearSessionSideKeys,
    consumeReconnectChallenge,
    createTokenIndex,
    loadTokenIndex,
    setTokenIndex,
    storeReconnectChallenge,
} from './redisStoreIndexSupport'
import { loadStoredSession, replaceStoredSession, ttlSecondsFromExpiry } from './redisStoreSessionSupport'
import {
    cloneSession,
    expireIfNeeded,
    isActiveState,
    sessionKey,
    tokenIndexKey,
    updateParticipant,
    updateState,
} from './storeSupport'
import type { PairingReconnectChallengeRecord, PairingStore, RedisPairingAdapter } from './storeTypes'

export { RedisClientPairingAdapter } from './redisPairingAdapter'

const SESSION_UPDATE_RETRY_LIMIT = 5

export class RedisPairingStore implements PairingStore {
    constructor(
        private readonly adapter: RedisPairingAdapter,
        private readonly now: () => number = Date.now
    ) {}

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

        const normalized = expireIfNeeded(stored, this.now(), new Map())
        if (normalized !== stored) {
            if (normalized.state === 'expired') {
                await clearSessionSideKeys(this.adapter, stored)
            }
            await this.saveSession(normalized)
        }

        return cloneSession(normalized)
    }

    async getSessionByTokenHash(
        tokenHash: string
    ): Promise<{ session: PairingSessionRecord; role: PairingRole } | null> {
        const index = await loadTokenIndex(this.adapter, tokenHash)
        if (!index) {
            return null
        }

        const session = await this.getSession(index.pairingId)
        if (!session || !isActiveState(session.state)) {
            await this.adapter.del(tokenIndexKey(tokenHash))
            return null
        }

        return { session, role: index.role }
    }

    async claimSession(
        pairingId: string,
        guest: PairingParticipantRecord,
        shortCode: string
    ): Promise<PairingSessionRecord | null> {
        const session = await this.updateSession(pairingId, async (current) => {
            if (!isActiveState(current.state) || current.guest) {
                return null
            }

            return updateState({
                ...current,
                updatedAt: this.now(),
                shortCode,
                approvalStatus: 'pending',
                guest: { ...guest },
            })
        })

        if (!session) {
            return null
        }

        await setTokenIndex({
            adapter: this.adapter,
            tokenHash: guest.tokenHash,
            pairingId,
            role: 'guest',
            ttlSeconds: this.ttlSeconds(session.expiresAt),
        })
        return session
    }

    async approveSession(pairingId: string, at: number): Promise<PairingSessionRecord | null> {
        return this.updateSession(pairingId, async (current) => {
            if (!isActiveState(current.state) || !current.guest) {
                return null
            }

            if (current.approvalStatus === 'approved') {
                return current
            }

            return updateState({
                ...current,
                updatedAt: at,
                approvalStatus: 'approved',
            })
        })
    }

    async markConnected(pairingId: string, role: PairingRole, at: number): Promise<PairingSessionRecord | null> {
        return this.updateParticipantState(pairingId, role, at, { connectedAt: at, lastSeenAt: at })
    }

    async touchConnection(pairingId: string, role: PairingRole, at: number): Promise<PairingSessionRecord | null> {
        return this.updateParticipantState(pairingId, role, at, { lastSeenAt: at })
    }

    async markDisconnected(pairingId: string, role: PairingRole, at: number): Promise<PairingSessionRecord | null> {
        return this.updateParticipantState(pairingId, role, at, { connectedAt: undefined, lastSeenAt: at })
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

    async deleteSession(pairingId: string, at: number): Promise<PairingSessionRecord | null> {
        const session = await this.updateSession(pairingId, async (current) => {
            if (current.state === 'deleted') {
                return current
            }

            return {
                ...current,
                state: 'deleted',
                updatedAt: at,
                host: { ...current.host, connectedAt: undefined },
                guest: current.guest ? { ...current.guest, connectedAt: undefined } : null,
            }
        })

        if (!session) {
            return null
        }

        await clearSessionSideKeys(this.adapter, session)
        return session
    }

    async updateParticipantState(
        pairingId: string,
        role: PairingRole,
        at: number,
        patch: Partial<Pick<PairingParticipantRecord, 'connectedAt' | 'lastSeenAt'>>
    ): Promise<PairingSessionRecord | null> {
        return this.updateSession(pairingId, async (current) => {
            if (!isActiveState(current.state)) {
                return null
            }

            return updateState({
                ...updateParticipant(current, role, patch),
                updatedAt: at,
            })
        })
    }

    async updateSession(
        pairingId: string,
        mutate: (session: PairingSessionRecord) => Promise<PairingSessionRecord | null>
    ): Promise<PairingSessionRecord | null> {
        for (let attempt = 0; attempt < SESSION_UPDATE_RETRY_LIMIT; attempt += 1) {
            const current = await this.getSession(pairingId)
            if (!current) {
                return null
            }

            const next = await mutate(current)
            if (!next) {
                return null
            }

            const ttlSeconds = this.ttlSeconds(next.expiresAt)
            const replaced = await replaceStoredSession({
                adapter: this.adapter,
                pairingId,
                current,
                next,
                ttlSeconds,
            })
            if (replaced) {
                return cloneSession(next)
            }
        }

        return null
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
