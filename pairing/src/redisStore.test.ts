import { describe, expect, it } from 'bun:test'
import { PairingSessionRecordSchema } from '@viby/protocol/pairing'
import { createParticipantRecord } from './httpSupport'
import { RedisPairingStore } from './redisStore'
import { reconnectChallengeKey, sessionKey, tokenIndexKey } from './storeSupport'
import type { RedisPairingAdapter } from './storeTypes'

function createSessionRecord(now: number) {
    const hostToken = 'host-secret'
    const host = createParticipantRecord({
        token: hostToken,
        label: 'Host device',
    })

    return {
        hostToken,
        session: PairingSessionRecordSchema.parse({
            id: 'pairing-redis-1',
            state: 'waiting',
            createdAt: now,
            updatedAt: now,
            expiresAt: now + 1_000,
            ticketExpiresAt: now + 500,
            shortCode: null,
            approvalStatus: null,
            ticketHash: 'ticket-hash',
            host,
            guest: null,
        }),
    }
}

class FakeRedisAdapter implements RedisPairingAdapter {
    readonly values = new Map<string, string>()
    readonly ttlByKey = new Map<string, number | undefined>()
    readonly compareAndSetCalls: Array<{ key: string; expected: string | null; next: string | null }> = []
    private readonly failCounts = new Map<string, number>()

    failNextCompareAndSet(key: string, times: number = 1): void {
        this.failCounts.set(key, times)
    }

    async get(key: string): Promise<string | null> {
        return this.values.get(key) ?? null
    }

    async set(key: string, value: string, options?: { ttlSeconds?: number }): Promise<void> {
        this.values.set(key, value)
        this.ttlByKey.set(key, options?.ttlSeconds)
    }

    async del(key: string): Promise<void> {
        this.values.delete(key)
        this.ttlByKey.delete(key)
    }

    async compareAndSet(
        key: string,
        expected: string | null,
        next: string | null,
        options?: { ttlSeconds?: number }
    ): Promise<boolean> {
        this.compareAndSetCalls.push({ key, expected, next })
        const remainingFailures = this.failCounts.get(key) ?? 0
        if (remainingFailures > 0) {
            this.failCounts.set(key, remainingFailures - 1)
            return false
        }

        const current = this.values.get(key) ?? null
        if (current !== expected) {
            return false
        }

        if (next === null) {
            this.values.delete(key)
            this.ttlByKey.delete(key)
        } else {
            this.values.set(key, next)
            this.ttlByKey.set(key, options?.ttlSeconds)
        }

        return true
    }
}

describe('RedisPairingStore', () => {
    it('rolls back the session record when host token index creation fails', async () => {
        const now = 1_000
        const adapter = new FakeRedisAdapter()
        const { session } = createSessionRecord(now)
        adapter.failNextCompareAndSet(tokenIndexKey(session.host.tokenHash))
        const store = new RedisPairingStore(adapter, () => now)

        await expect(store.createSession(session)).rejects.toThrow(
            `Pairing token index for session ${session.id} already exists`
        )

        expect(adapter.values.get(sessionKey(session.id))).toBeUndefined()
        expect(adapter.values.get(tokenIndexKey(session.host.tokenHash))).toBeUndefined()
    })

    it('retries optimistic updates after a compare-and-set conflict', async () => {
        let now = 1_000
        const adapter = new FakeRedisAdapter()
        const { session } = createSessionRecord(now)
        const store = new RedisPairingStore(adapter, () => now)

        await store.createSession(session)
        adapter.failNextCompareAndSet(sessionKey(session.id))
        now = 1_050

        const updated = await store.markConnected(session.id, 'host', now)

        expect(updated?.host.connectedAt).toBe(now)
        expect(
            adapter.compareAndSetCalls.filter((call) => call.key === sessionKey(session.id)).length
        ).toBeGreaterThanOrEqual(3)
    })

    it('expires sessions and clears both token indexes during redis-backed reads', async () => {
        let now = 1_000
        const adapter = new FakeRedisAdapter()
        const { session } = createSessionRecord(now)
        const store = new RedisPairingStore(adapter, () => now)
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })

        await store.createSession(session)
        const claimed = await store.claimSession(session.id, guest, '123456')
        expect(claimed?.guest?.tokenHash).toBe(guest.tokenHash)
        await store.issueReconnectChallenge(session.id, 'host', {
            nonce: 'host-expire',
            issuedAt: now,
            expiresAt: now + 600,
        })
        await store.issueReconnectChallenge(session.id, 'guest', {
            nonce: 'guest-expire',
            issuedAt: now,
            expiresAt: now + 600,
        })

        now = session.expiresAt + 1

        await expect(store.getSessionByTokenHash(session.host.tokenHash)).resolves.toBeNull()
        await expect(store.getSessionByTokenHash(guest.tokenHash)).resolves.toBeNull()

        const persisted = adapter.values.get(sessionKey(session.id))
        expect(persisted).toBeTruthy()
        expect(JSON.parse(persisted!).state).toBe('expired')
        expect(adapter.values.get(tokenIndexKey(session.host.tokenHash))).toBeUndefined()
        expect(adapter.values.get(tokenIndexKey(guest.tokenHash))).toBeUndefined()
        expect(adapter.values.get(reconnectChallengeKey(session.id, 'host'))).toBeUndefined()
        expect(adapter.values.get(reconnectChallengeKey(session.id, 'guest'))).toBeUndefined()
    })

    it('stores reconnect challenges in redis and consumes them once', async () => {
        const now = 1_000
        const adapter = new FakeRedisAdapter()
        const { session } = createSessionRecord(now)
        const store = new RedisPairingStore(adapter, () => now)

        await store.createSession(session)
        await store.issueReconnectChallenge(session.id, 'guest', {
            nonce: 'nonce-1',
            issuedAt: now,
            expiresAt: now + 600,
        })

        await expect(store.consumeReconnectChallenge(session.id, 'guest', 'nonce-1', now + 1)).resolves.toBe(true)
        await expect(store.consumeReconnectChallenge(session.id, 'guest', 'nonce-1', now + 1)).resolves.toBe(false)
    })

    it('clears reconnect challenges when a session is deleted', async () => {
        const now = 1_000
        const adapter = new FakeRedisAdapter()
        const { session } = createSessionRecord(now)
        const store = new RedisPairingStore(adapter, () => now)

        await store.createSession(session)
        await store.issueReconnectChallenge(session.id, 'host', {
            nonce: 'host-delete',
            issuedAt: now,
            expiresAt: now + 600,
        })
        await store.issueReconnectChallenge(session.id, 'guest', {
            nonce: 'guest-delete',
            issuedAt: now,
            expiresAt: now + 600,
        })

        await expect(store.deleteSession(session.id, now + 1)).resolves.toMatchObject({ state: 'deleted' })
        expect(adapter.values.get(reconnectChallengeKey(session.id, 'host'))).toBeUndefined()
        expect(adapter.values.get(reconnectChallengeKey(session.id, 'guest'))).toBeUndefined()
    })
})
