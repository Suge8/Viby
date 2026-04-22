import { MemoryPairingStore } from './memoryStore'
import { RedisClientPairingAdapter, RedisPairingStore } from './redisStore'
import { createRedisPairingStoreLease } from './redisStoreLease'
import type { PairingStoreLease } from './storeTypes'

export type { PairingStore, PairingStoreLease, RedisPairingAdapter } from './storeTypes'
export { MemoryPairingStore, RedisClientPairingAdapter, RedisPairingStore }

export async function createConfiguredPairingStore(options: {
    redisUrl: string | null
    now?: () => number
}): Promise<PairingStoreLease> {
    if (!options.redisUrl) {
        return {
            store: new MemoryPairingStore(options.now),
            async dispose() {},
        }
    }

    return await createRedisPairingStoreLease({
        redisUrl: options.redisUrl,
        now: options.now,
    })
}
