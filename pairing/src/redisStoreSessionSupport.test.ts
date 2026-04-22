import { describe, expect, it } from 'bun:test'
import { PairingSessionRecordSchema } from '@viby/protocol/pairing'
import { createParticipantRecord } from './httpSupport'
import { loadStoredSession, replaceStoredSession, ttlSecondsFromExpiry } from './redisStoreSessionSupport'
import { sessionKey } from './storeSupport'
import type { RedisPairingAdapter } from './storeTypes'

class FakeRedisAdapter implements RedisPairingAdapter {
    readonly values = new Map<string, string>()

    async get(key: string): Promise<string | null> {
        return this.values.get(key) ?? null
    }

    async set(key: string, value: string): Promise<void> {
        this.values.set(key, value)
    }

    async del(key: string): Promise<void> {
        this.values.delete(key)
    }

    async compareAndSet(key: string, expected: string | null, next: string | null): Promise<boolean> {
        const current = this.values.get(key) ?? null
        if (current !== expected) {
            return false
        }
        if (next === null) {
            this.values.delete(key)
            return true
        }
        this.values.set(key, next)
        return true
    }
}

function createSession(now: number) {
    return PairingSessionRecordSchema.parse({
        id: 'pairing-session-support',
        state: 'waiting',
        createdAt: now,
        updatedAt: now,
        expiresAt: now + 1_000,
        ticketExpiresAt: now + 500,
        shortCode: null,
        approvalStatus: null,
        ticketHash: 'ticket-hash',
        host: createParticipantRecord({ token: 'host-token', label: 'Host' }),
        guest: null,
    })
}

describe('redisStoreSessionSupport', () => {
    it('loads a valid stored session', async () => {
        const adapter = new FakeRedisAdapter()
        const session = createSession(1_000)
        adapter.values.set(sessionKey(session.id), JSON.stringify(session))

        await expect(loadStoredSession(adapter, session.id)).resolves.toMatchObject({
            id: session.id,
            state: 'waiting',
        })
    })

    it('deletes malformed session payloads', async () => {
        const adapter = new FakeRedisAdapter()
        adapter.values.set(sessionKey('pairing-bad-json'), '{broken-json')

        await expect(loadStoredSession(adapter, 'pairing-bad-json')).resolves.toBeNull()
        expect(adapter.values.get(sessionKey('pairing-bad-json'))).toBeUndefined()
    })

    it('deletes invalid parsed session payloads', async () => {
        const adapter = new FakeRedisAdapter()
        adapter.values.set(sessionKey('pairing-invalid-shape'), JSON.stringify({ id: 'pairing-invalid-shape' }))

        await expect(loadStoredSession(adapter, 'pairing-invalid-shape')).resolves.toBeNull()
        expect(adapter.values.get(sessionKey('pairing-invalid-shape'))).toBeUndefined()
    })

    it('replaces a stored session only when the expected payload matches', async () => {
        const adapter = new FakeRedisAdapter()
        const current = createSession(1_000)
        const next = PairingSessionRecordSchema.parse({
            ...current,
            updatedAt: 1_100,
            approvalStatus: 'approved',
        })
        adapter.values.set(sessionKey(current.id), JSON.stringify(current))

        await expect(
            replaceStoredSession({
                adapter,
                pairingId: current.id,
                current,
                next,
                ttlSeconds: 1,
            })
        ).resolves.toBe(true)
        expect(adapter.values.get(sessionKey(current.id))).toBe(JSON.stringify(next))

        await expect(
            replaceStoredSession({
                adapter,
                pairingId: current.id,
                current,
                next: current,
                ttlSeconds: 1,
            })
        ).resolves.toBe(false)
    })

    it('derives a minimum ttl of one second', () => {
        let now = 1_000
        const currentNow = () => now

        expect(ttlSecondsFromExpiry(2_600, currentNow)).toBe(2)

        now = 5_000
        expect(ttlSecondsFromExpiry(4_900, currentNow)).toBe(1)
    })
})
