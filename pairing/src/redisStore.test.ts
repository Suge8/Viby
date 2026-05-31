import { describe, expect, it } from 'bun:test'
import { PairingSessionRecordSchema } from '@viby/protocol/pairing'
import { createParticipantRecord } from './httpSupport'

function createAuthorizedDevice(guest: ReturnType<typeof createParticipantRecord>, at: number) {
    return {
        id: guest.publicKey ?? guest.tokenHash,
        publicKey: guest.publicKey ?? guest.tokenHash,
        label: guest.label,
        metadata: guest.metadata,
        authorizedAt: at,
        lastSeenAt: at,
    }
}

function createConnection(participant: ReturnType<typeof createParticipantRecord>) {
    return { connectionId: participant.tokenHash, participant }
}

import { RedisPairingStore } from './redisStore'
import { handoffTicketKey, reconnectChallengeKey, sessionKey, tokenIndexKey } from './storeSupport'
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
            shortCode: '123456',
            approvalStatus: null,
            host,
            authorizedDevice: null,
        }),
    }
}

class FakeRedisAdapter implements RedisPairingAdapter {
    readonly values = new Map<string, string>()
    readonly hashes = new Map<string, Map<string, string>>()
    readonly ttlByKey = new Map<string, number | undefined>()
    readonly compareAndSetCalls: Array<{ key: string; expected: string | null; next: string | null }> = []
    readonly evalCalls: Array<{ args: readonly string[]; keys: readonly string[] }> = []
    private readonly failCounts = new Map<string, number>()
    private readonly failEvalCounts = new Map<string, number>()

    failNextCompareAndSet(key: string, times: number = 1): void {
        this.failCounts.set(key, times)
    }

    failNextEval(key: string, times: number = 1): void {
        this.failEvalCounts.set(key, times)
    }

    async ping(): Promise<void> {}

    async get(key: string): Promise<string | null> {
        return this.values.get(key) ?? null
    }

    async set(key: string, value: string, options?: { ttlSeconds?: number }): Promise<void> {
        this.values.set(key, value)
        this.ttlByKey.set(key, options?.ttlSeconds)
    }

    async del(key: string): Promise<void> {
        this.values.delete(key)
        this.hashes.delete(key)
        this.ttlByKey.delete(key)
    }

    async expire(key: string, ttlSeconds: number): Promise<void> {
        this.ttlByKey.set(key, ttlSeconds)
    }

    async hgetall(key: string): Promise<Record<string, string>> {
        return Object.fromEntries(this.hashes.get(key) ?? [])
    }

    async hset(key: string, field: string, value: string): Promise<void> {
        const hash = this.hashes.get(key) ?? new Map<string, string>()
        hash.set(field, value)
        this.hashes.set(key, hash)
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

    async eval<T>(_script: string, keys: readonly string[], args: readonly string[]): Promise<T> {
        this.evalCalls.push({ args, keys })
        const [sessionKeyValue, remoteIndexKeyValue, tokenIndexKeyValue] = keys
        const [expectedRaw, nextRaw, connectionId, connectionRaw, ttlSeconds, tokenIndexRaw] = args
        if (!sessionKeyValue || !remoteIndexKeyValue || !tokenIndexKeyValue) return 0 as T
        const remainingFailures = this.failEvalCounts.get(sessionKeyValue) ?? 0
        if (remainingFailures > 0) {
            this.failEvalCounts.set(sessionKeyValue, remainingFailures - 1)
            return 0 as T
        }
        if ((this.values.get(sessionKeyValue) ?? null) !== expectedRaw) return 0 as T
        this.values.set(sessionKeyValue, nextRaw ?? '')
        this.ttlByKey.set(sessionKeyValue, Number(ttlSeconds))
        const hash = this.hashes.get(remoteIndexKeyValue) ?? new Map<string, string>()
        hash.set(connectionId ?? '', connectionRaw ?? '')
        this.hashes.set(remoteIndexKeyValue, hash)
        this.ttlByKey.set(remoteIndexKeyValue, Number(ttlSeconds))
        this.values.set(tokenIndexKeyValue, tokenIndexRaw ?? '')
        this.ttlByKey.set(tokenIndexKeyValue, Number(ttlSeconds))
        return 1 as T
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

        const updated = await store.renewSession(session.id, now + 2_000, now)

        expect(updated?.expiresAt).toBe(now + 2_000)
        expect(
            adapter.compareAndSetCalls.filter((call) => call.key === sessionKey(session.id)).length
        ).toBeGreaterThanOrEqual(3)
    })

    it('does not partially approve when the atomic session and connection write loses the CAS race', async () => {
        const now = 1_000
        const adapter = new FakeRedisAdapter()
        const { session } = createSessionRecord(now)
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })
        const store = new RedisPairingStore(adapter, () => now)

        await store.createSession(session)
        adapter.failNextEval(sessionKey(session.id), 5)

        await expect(
            store.verifyCodeAndApprove(
                session.id,
                '123456',
                createAuthorizedDevice(guest, now + 1),
                createConnection(guest),
                now + 1
            )
        ).resolves.toBeNull()
        await expect(store.getSessionByTokenHash(guest.tokenHash)).resolves.toBeNull()
        await expect(store.getSession(session.id)).resolves.toMatchObject({ approvalStatus: null })
    })

    it('approves sessions using the exact stored payload instead of schema-reordered JSON', async () => {
        const now = 1_000
        const adapter = new FakeRedisAdapter()
        const { session } = createSessionRecord(now)
        const store = new RedisPairingStore(adapter, () => now)
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })
        const hostWithRuntimeFieldsFirst = {
            tokenHint: session.host.tokenHint,
            label: session.host.label,
            tokenHash: session.host.tokenHash,
            connectedAt: now,
            lastSeenAt: now,
        }
        const raw = JSON.stringify({
            ...session,
            updatedAt: now,
            host: hostWithRuntimeFieldsFirst,
        })
        adapter.values.set(sessionKey(session.id), raw)

        const verified = await store.verifyCodeAndApprove(
            session.id,
            '123456',
            createAuthorizedDevice(guest, now + 1),
            createConnection(guest),
            now + 1
        )

        expect(verified?.authorizedDevice?.id).toBe(guest.tokenHash)
        expect(adapter.evalCalls.at(-1)?.args[0]).toBe(raw)
    })

    it('expires sessions and clears both token indexes during redis-backed reads', async () => {
        let now = 1_000
        const adapter = new FakeRedisAdapter()
        const { session } = createSessionRecord(now)
        const store = new RedisPairingStore(adapter, () => now)
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })

        await store.createSession(session)
        const verified = await store.verifyCodeAndApprove(
            session.id,
            '123456',
            createAuthorizedDevice(guest, now + 1),
            createConnection(guest),
            now + 1
        )
        expect(verified?.authorizedDevice?.id).toBe(guest.tokenHash)
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
        await store.issueHandoffTicket(session.id, { tokenHash: 'handoff-hash', expiresAt: now + 600 })

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
        expect(adapter.values.get(handoffTicketKey(session.id))).toBeUndefined()
    })

    it('renews session and token index TTLs for reconnecting paired devices', async () => {
        const now = 1_000
        const adapter = new FakeRedisAdapter()
        const { session } = createSessionRecord(now)
        const store = new RedisPairingStore(adapter, () => now)
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })

        await store.createSession(session)
        await store.verifyCodeAndApprove(
            session.id,
            '123456',
            createAuthorizedDevice(guest, now + 1),
            createConnection(guest),
            now + 1
        )

        await expect(store.renewSession(session.id, now + 10_000, now + 5)).resolves.toMatchObject({
            expiresAt: now + 10_000,
            updatedAt: now + 5,
        })
        expect(adapter.ttlByKey.get(sessionKey(session.id))).toBe(10)
        expect(adapter.ttlByKey.get(tokenIndexKey(session.host.tokenHash))).toBe(10)
        expect(adapter.ttlByKey.get(tokenIndexKey(guest.tokenHash))).toBe(10)
    })

    it('stores independent PWA handoff tickets in redis and consumes each once', async () => {
        const now = 1_000
        const adapter = new FakeRedisAdapter()
        const { session } = createSessionRecord(now)
        const store = new RedisPairingStore(adapter, () => now)

        await store.createSession(session)
        await store.issueHandoffTicket(session.id, { tokenHash: 'handoff-a', expiresAt: now + 600 })
        await store.issueHandoffTicket(session.id, { tokenHash: 'handoff-b', expiresAt: now + 600 })

        await expect(store.consumeHandoffTicket(session.id, 'handoff-a', now + 1)).resolves.toBe(true)
        await expect(store.consumeHandoffTicket(session.id, 'handoff-a', now + 1)).resolves.toBe(false)
        await expect(store.consumeHandoffTicket(session.id, 'handoff-b', now + 1)).resolves.toBe(true)
        await expect(store.consumeHandoffTicket(session.id, 'handoff-b', now + 1)).resolves.toBe(false)
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
        await store.issueHandoffTicket(session.id, { tokenHash: 'handoff-hash', expiresAt: now + 600 })

        await expect(store.deleteSession(session.id, now + 1)).resolves.toMatchObject({ state: 'deleted' })
        expect(adapter.values.get(reconnectChallengeKey(session.id, 'host'))).toBeUndefined()
        expect(adapter.values.get(reconnectChallengeKey(session.id, 'guest'))).toBeUndefined()
        expect(adapter.values.get(handoffTicketKey(session.id, 'handoff-hash'))).toBeUndefined()
    })
})
