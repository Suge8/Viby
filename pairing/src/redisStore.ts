import {
    type PairingParticipantRecord,
    type PairingRole,
    type PairingSessionRecord,
    PairingSessionRecordSchema,
} from '@viby/protocol/pairing'
import {
    clearSessionSideKeys,
    consumeHandoffTicket,
    consumeReconnectChallenge,
    createTokenIndex,
    loadTokenIndex,
    setTokenIndex,
    storeHandoffTicket,
    storeReconnectChallenge,
} from './redisStoreIndexSupport'
import { renewRedisPairingSession } from './redisStoreRenewal'
import {
    loadStoredSession,
    loadStoredSessionEntry,
    replaceStoredSession,
    ttlSecondsFromExpiry,
} from './redisStoreSessionSupport'
import {
    cloneSession,
    expireIfNeeded,
    isActiveState,
    sessionKey,
    tokenIndexKey,
    updateState,
} from './storeSupport'
import type {
    PairingHandoffTicketRecord,
    PairingReconnectChallengeRecord,
    PairingStore,
    RedisPairingAdapter,
} from './storeTypes'

export { RedisClientPairingAdapter } from './redisPairingAdapter'

const SESSION_UPDATE_RETRY_LIMIT = 5

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
        if (!session || session.state === 'expired') {
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

    async bindGuestDeviceKey(pairingId: string, publicKey: string, at: number): Promise<PairingSessionRecord | null> {
        return this.updateSession(pairingId, async (current) => {
            if (!isActiveState(current.state) || !current.guest) return null
            if (current.guest.publicKey) return current.guest.publicKey === publicKey ? current : null
            return updateState({ ...current, updatedAt: at, guest: { ...current.guest, publicKey } })
        })
    }
    async rotateGuestToken(
        pairingId: string,
        guest: PairingParticipantRecord,
        at: number
    ): Promise<PairingSessionRecord | null> {
        let oldTokenHash: string | null = null
        const session = await this.updateSession(pairingId, async (current) => {
            if (!isActiveState(current.state) || !current.guest) return null
            oldTokenHash = current.guest.tokenHash
            return updateState({ ...current, updatedAt: at, guest: { ...guest } })
        })
        if (!session) return null

        if (oldTokenHash) await this.adapter.del(tokenIndexKey(oldTokenHash))
        await setTokenIndex({
            adapter: this.adapter,
            tokenHash: guest.tokenHash,
            pairingId,
            role: 'guest',
            ttlSeconds: this.ttlSeconds(session.expiresAt),
        })
        return session
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

    async updateSession(
        pairingId: string,
        mutate: (session: PairingSessionRecord) => Promise<PairingSessionRecord | null>
    ): Promise<PairingSessionRecord | null> {
        for (let attempt = 0; attempt < SESSION_UPDATE_RETRY_LIMIT; attempt += 1) {
            const entry = await loadStoredSessionEntry(this.adapter, pairingId)
            if (!entry) {
                return null
            }

            const current = expireIfNeeded(entry.session, this.now(), new Map())
            if (current !== entry.session) {
                if (current.state === 'expired') {
                    await clearSessionSideKeys(this.adapter, entry.session)
                }
                await replaceStoredSession({
                    adapter: this.adapter,
                    pairingId,
                    expectedRaw: entry.raw,
                    next: current,
                    ttlSeconds: this.ttlSeconds(current.expiresAt),
                })
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
                expectedRaw: entry.raw,
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
