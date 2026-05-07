import { describe, expect, it } from 'bun:test'
import { RedisClientPairingAdapter } from './redisPairingAdapter'

class FakeRedisClient {
    readonly values = new Map<string, string>()
    readonly ttl = new Map<string, number>()

    async ping(): Promise<string> {
        return 'PONG'
    }

    async get(key: string): Promise<string | null> {
        return this.values.get(key) ?? null
    }

    async set(key: string, value: string, options?: { EX: number }): Promise<void> {
        this.values.set(key, value)
        if (options) {
            this.ttl.set(key, options.EX)
        }
    }

    async del(key: string): Promise<void> {
        this.values.delete(key)
        this.ttl.delete(key)
    }

    async sendCommand<T>(args: readonly string[]): Promise<T> {
        const [, , , key, expectedMode, expectedValue, nextMode, nextValue, ttlValue] = args
        const current = this.values.get(key)
        const matches = expectedMode === 'null' ? current === undefined : current === expectedValue
        if (!matches) {
            return 0 as T
        }

        if (nextMode === 'null') {
            await this.del(key)
        } else {
            const ttlSeconds = Number(ttlValue)
            await this.set(key, nextValue, ttlSeconds > 0 ? { EX: ttlSeconds } : undefined)
        }

        return 1 as T
    }
}

describe('RedisClientPairingAdapter', () => {
    it('performs compare-and-set through a single atomic Redis command', async () => {
        const client = new FakeRedisClient()
        const adapter = new RedisClientPairingAdapter(client)

        await expect(adapter.compareAndSet('session', null, 'created', { ttlSeconds: 60 })).resolves.toBe(true)
        expect(client.values.get('session')).toBe('created')
        expect(client.ttl.get('session')).toBe(60)

        await expect(adapter.compareAndSet('session', null, 'duplicate')).resolves.toBe(false)
        expect(client.values.get('session')).toBe('created')

        await expect(adapter.compareAndSet('session', 'created', 'claimed')).resolves.toBe(true)
        expect(client.values.get('session')).toBe('claimed')

        await expect(adapter.compareAndSet('session', 'claimed', null)).resolves.toBe(true)
        expect(client.values.has('session')).toBe(false)
    })
})
