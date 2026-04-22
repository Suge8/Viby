import type { RedisClientType } from 'redis'
import type { RedisPairingAdapter } from './storeTypes'

export class RedisClientPairingAdapter implements RedisPairingAdapter {
    constructor(private readonly client: RedisClientType) {}

    async get(key: string): Promise<string | null> {
        return await this.client.get(key)
    }

    async set(key: string, value: string, options?: { ttlSeconds?: number }): Promise<void> {
        if (options?.ttlSeconds) {
            await this.client.set(key, value, { EX: options.ttlSeconds })
            return
        }

        await this.client.set(key, value)
    }

    async del(key: string): Promise<void> {
        await this.client.del(key)
    }

    async compareAndSet(
        key: string,
        expected: string | null,
        next: string | null,
        options?: { ttlSeconds?: number }
    ): Promise<boolean> {
        await this.client.watch(key)

        try {
            const current = await this.client.get(key)
            if (current !== expected) {
                await this.client.unwatch()
                return false
            }

            const multi = this.client.multi()
            if (next === null) {
                multi.del(key)
            } else if (options?.ttlSeconds) {
                multi.set(key, next, { EX: options.ttlSeconds })
            } else {
                multi.set(key, next)
            }

            const result = await multi.exec()
            return result !== null
        } finally {
            try {
                await this.client.unwatch()
            } catch {
                // noop
            }
        }
    }
}
