import { describe, expect, it } from 'bun:test'
import { PairingSessionRecordSchema } from '@viby/protocol/pairing'
import { createParticipantRecord } from './httpSupport'
import {
    clearReconnectChallenges,
    clearTokenIndexes,
    consumeReconnectChallenge,
    createTokenIndex,
    loadTokenIndex,
    setTokenIndex,
    storeReconnectChallenge,
} from './redisStoreIndexSupport'
import { reconnectChallengeKey, tokenIndexKey } from './storeSupport'
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
    const host = createParticipantRecord({ token: 'host-token', label: 'Host' })
    const guest = createParticipantRecord({ token: 'guest-token', label: 'Guest' })
    return PairingSessionRecordSchema.parse({
        id: 'pairing-index-support',
        state: 'claimed',
        createdAt: now,
        updatedAt: now,
        expiresAt: now + 1_000,
        ticketExpiresAt: now + 500,
        shortCode: '123456',
        approvalStatus: 'pending',
        ticketHash: 'ticket-hash',
        host,
        guest,
    })
}

describe('redisStoreIndexSupport', () => {
    it('creates and loads token indexes', async () => {
        const adapter = new FakeRedisAdapter()

        await expect(
            createTokenIndex({
                adapter,
                tokenHash: 'host-hash',
                pairingId: 'pairing-1',
                role: 'host',
                ttlSeconds: 1,
            })
        ).resolves.toBe(true)

        await expect(loadTokenIndex(adapter, 'host-hash')).resolves.toEqual({
            pairingId: 'pairing-1',
            role: 'host',
        })

        await setTokenIndex({
            adapter,
            tokenHash: 'guest-hash',
            pairingId: 'pairing-1',
            role: 'guest',
            ttlSeconds: 1,
        })
        await expect(loadTokenIndex(adapter, 'guest-hash')).resolves.toEqual({
            pairingId: 'pairing-1',
            role: 'guest',
        })
    })

    it('cleans up invalid token index payloads', async () => {
        const adapter = new FakeRedisAdapter()
        adapter.values.set(tokenIndexKey('broken-hash'), '{"pairingId":123}')

        await expect(loadTokenIndex(adapter, 'broken-hash')).resolves.toBeNull()
        expect(adapter.values.get(tokenIndexKey('broken-hash'))).toBeUndefined()
    })

    it('stores, consumes, and clears reconnect challenges', async () => {
        const adapter = new FakeRedisAdapter()

        await storeReconnectChallenge({
            adapter,
            pairingId: 'pairing-1',
            role: 'guest',
            challenge: {
                nonce: 'nonce-1',
                issuedAt: 1_000,
                expiresAt: 2_000,
            },
            ttlSeconds: 1,
        })

        await expect(
            consumeReconnectChallenge({
                adapter,
                pairingId: 'pairing-1',
                role: 'guest',
                nonce: 'nonce-1',
                at: 1_500,
            })
        ).resolves.toBe(true)
        await expect(
            consumeReconnectChallenge({
                adapter,
                pairingId: 'pairing-1',
                role: 'guest',
                nonce: 'nonce-1',
                at: 1_500,
            })
        ).resolves.toBe(false)

        await storeReconnectChallenge({
            adapter,
            pairingId: 'pairing-1',
            role: 'host',
            challenge: {
                nonce: 'nonce-host',
                issuedAt: 1_000,
                expiresAt: 2_000,
            },
            ttlSeconds: 1,
        })
        await storeReconnectChallenge({
            adapter,
            pairingId: 'pairing-1',
            role: 'guest',
            challenge: {
                nonce: 'nonce-guest',
                issuedAt: 1_000,
                expiresAt: 2_000,
            },
            ttlSeconds: 1,
        })

        await clearReconnectChallenges(adapter, 'pairing-1')
        expect(adapter.values.get(reconnectChallengeKey('pairing-1', 'host'))).toBeUndefined()
        expect(adapter.values.get(reconnectChallengeKey('pairing-1', 'guest'))).toBeUndefined()
    })

    it('clears both host and guest token indexes for a session', async () => {
        const adapter = new FakeRedisAdapter()
        const session = createSession(1_000)

        await setTokenIndex({
            adapter,
            tokenHash: session.host.tokenHash,
            pairingId: session.id,
            role: 'host',
            ttlSeconds: 1,
        })
        await setTokenIndex({
            adapter,
            tokenHash: session.guest!.tokenHash,
            pairingId: session.id,
            role: 'guest',
            ttlSeconds: 1,
        })

        await clearTokenIndexes(adapter, session)
        expect(adapter.values.get(tokenIndexKey(session.host.tokenHash))).toBeUndefined()
        expect(adapter.values.get(tokenIndexKey(session.guest!.tokenHash))).toBeUndefined()
    })
})
