import { type PairingRole, type PairingSessionRecord, PairingSessionRecordSchema } from '@viby/protocol/pairing'
import {
    clearSessionSideKeys,
    consumeHandoffTicket,
    consumeReconnectChallenge,
    createTokenIndex,
    loadTokenIndex,
    storeHandoffTicket,
    storeReconnectChallenge,
} from './redisStoreIndexSupport'
import {
    createRemoteConnection,
    loadGuestRemoteConnections,
    markGuestRemoteConnectionForSession,
    updateSessionWithRemoteConnection,
} from './redisStoreRemoteConnections'
import { renewRedisPairingSession } from './redisStoreRenewal'
import { loadStoredSession, ttlSecondsFromExpiry } from './redisStoreSessionSupport'
import { updateRedisPairingSession } from './redisStoreUpdate'
import { cloneSession, expireIfNeeded, isActiveState, sessionKey, tokenIndexKey, updateState } from './storeSupport'
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

    async claimAndApprove(
        pairingId: string,
        providedCode: string,
        device: PairingSessionRecord['authorizedDevice'],
        connection: PairingRemoteConnectionDraft,
        at: number
    ): Promise<PairingSessionRecord | null> {
        if (!device) return null
        return await updateSessionWithRemoteConnection({
            adapter: this.adapter,
            now: this.now,
            pairingId,
            ttlSeconds: (expiresAt) => this.ttlSeconds(expiresAt),
            mutate: async (current) => {
                if (!isActiveState(current.state) || current.authorizedDevice) return null
                if (current.shortCode === null || current.shortCode !== providedCode) return null
                const session = updateState({
                    ...current,
                    updatedAt: at,
                    approvalStatus: 'approved',
                    authorizedDevice: { ...device },
                })
                return { connection: createRemoteConnection(pairingId, device.id, connection, at), session }
            },
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
            mutate: async (current) => {
                const device = current.authorizedDevice
                if (!isActiveState(current.state) || !device || current.approvalStatus !== 'approved') return null
                const session = updateState({
                    ...current,
                    updatedAt: at,
                    authorizedDevice: { ...device, lastSeenAt: at },
                })
                return { connection: createRemoteConnection(pairingId, device.id, connection, at), session }
            },
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
        const session = await this.updateSession(pairingId, async (current) => {
            if (current.state === 'deleted') {
                return current
            }

            return {
                ...current,
                state: 'deleted',
                updatedAt: at,
                host: { ...current.host, connectedAt: undefined },
                authorizedDevice: current.authorizedDevice,
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
