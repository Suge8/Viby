import { describe, expect, it } from 'bun:test'
import { RedisClientPairingAdapter } from './redisPairingAdapter'
import { loadTokenIndex } from './redisStoreIndexSupport'
import {
    createRemoteConnection,
    loadGuestRemoteConnections,
    markGuestRemoteConnectionForSession,
    saveGuestRemoteConnectionToken,
} from './redisStoreRemoteConnections'

class FakeRedisClient {
    readonly values = new Map<string, string>()
    readonly hashes = new Map<string, Map<string, string>>()
    readonly ttl = new Map<string, number>()

    async ping(): Promise<string> {
        return 'PONG'
    }

    async get(key: string): Promise<string | null> {
        return this.values.get(key) ?? null
    }

    async set(key: string, value: string, options?: { EX: number }): Promise<void> {
        this.values.set(key, value)
        if (options) this.ttl.set(key, options.EX)
    }

    async del(key: string): Promise<void> {
        this.values.delete(key)
        this.hashes.delete(key)
        this.ttl.delete(key)
    }

    async expire(key: string, seconds: number): Promise<void> {
        this.ttl.set(key, seconds)
    }

    async hGetAll(key: string): Promise<Record<string, string>> {
        return Object.fromEntries(this.hashes.get(key)?.entries() ?? [])
    }

    async hSet(key: string, field: string, value: string): Promise<void> {
        if (this.values.has(key)) throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value')
        const hash = this.hashes.get(key) ?? new Map<string, string>()
        hash.set(field, value)
        this.hashes.set(key, hash)
    }

    async sendCommand<T>(args: readonly string[]): Promise<T> {
        const [, , , key, expectedMode, expectedValue, nextMode, nextValue, ttlValue] = args
        const current = this.values.get(key)
        const matches = expectedMode === 'null' ? current === undefined : current === expectedValue
        if (!matches) return 0 as T
        if (nextMode === 'null') await this.del(key)
        else await this.set(key, nextValue, Number(ttlValue) > 0 ? { EX: Number(ttlValue) } : undefined)
        return 1 as T
    }
}

describe('redis remote connection helpers', () => {
    it('persists connection records and token index without touching the legacy token-array key', async () => {
        const client = new FakeRedisClient()
        client.values.set('pairing:guest-token-index:pairing-1', '["legacy-token"]')
        const adapter = new RedisClientPairingAdapter(client)
        const connection = createRemoteConnection(
            'pairing-1',
            'public-key',
            {
                connectionId: 'connection-id',
                participant: {
                    tokenHash: 'token-hash',
                    label: 'Phone',
                    publicKey: 'public-key',
                    metadata: { platform: 'ios' },
                },
            },
            1_000
        )

        await saveGuestRemoteConnectionToken({ adapter, connection, ttlSeconds: 60 })

        await expect(loadGuestRemoteConnections(adapter, 'pairing-1')).resolves.toEqual([connection])
        await expect(loadTokenIndex(adapter, 'token-hash')).resolves.toEqual({
            connectionId: 'connection-id',
            pairingId: 'pairing-1',
            role: 'guest',
        })
    })

    it('marks liveness without changing authorization identity', async () => {
        const adapter = new RedisClientPairingAdapter(new FakeRedisClient())
        const connection = createRemoteConnection(
            'pairing-1',
            'public-key',
            { connectionId: 'connection-id', participant: { tokenHash: 'token-hash' } },
            1_000
        )
        await saveGuestRemoteConnectionToken({ adapter, connection, ttlSeconds: 60 })

        await markGuestRemoteConnectionForSession({
            adapter,
            pairingId: 'pairing-1',
            connectionId: 'connection-id',
            at: 1_500,
            connected: true,
            getExpiresAt: async () => 10_000,
            ttlSeconds: () => 60,
        })
        await expect(loadGuestRemoteConnections(adapter, 'pairing-1')).resolves.toContainEqual({
            ...connection,
            connectedAt: 1_500,
            lastSeenAt: 1_500,
        })

        await markGuestRemoteConnectionForSession({
            adapter,
            pairingId: 'pairing-1',
            connectionId: 'connection-id',
            at: 1_700,
            connected: false,
            getExpiresAt: async () => 10_000,
            ttlSeconds: () => 60,
        })
        await expect(loadGuestRemoteConnections(adapter, 'pairing-1')).resolves.toContainEqual({
            ...connection,
            connectedAt: undefined,
            lastSeenAt: 1_700,
        })
    })
})
