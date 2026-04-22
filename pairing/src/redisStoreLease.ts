import { createClient, type RedisClientType } from 'redis'
import { RedisClientPairingAdapter, RedisPairingStore } from './redisStore'
import type { PairingStoreLease } from './storeTypes'

export async function createRedisPairingStoreLease(options: {
    redisUrl: string
    now?: () => number
}): Promise<PairingStoreLease> {
    const client: RedisClientType = createClient({ url: options.redisUrl })
    await client.connect()

    return {
        store: new RedisPairingStore(new RedisClientPairingAdapter(client), options.now),
        async dispose() {
            await client.quit()
        },
    }
}
