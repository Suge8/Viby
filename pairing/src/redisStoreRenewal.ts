import type { PairingSessionRecord } from '@viby/protocol/pairing'
import { renewPairingSession } from './pairingSessionTransition'
import { loadRemoteConnectionIndex, setTokenIndex } from './redisStoreIndexSupport'
import type { RedisPairingAdapter } from './storeTypes'

type RedisSessionMutator = (
    pairingId: string,
    mutate: (session: PairingSessionRecord) => Promise<PairingSessionRecord | null>
) => Promise<PairingSessionRecord | null>

export async function renewRedisPairingSession(options: {
    adapter: RedisPairingAdapter
    pairingId: string
    expiresAt: number
    at: number
    ttlSeconds(expiresAt: number): number
    updateSession: RedisSessionMutator
}): Promise<PairingSessionRecord | null> {
    const session = await options.updateSession(options.pairingId, async (current) => {
        return renewPairingSession(current, options.expiresAt, options.at)?.nextSession ?? null
    })
    if (!session) return null

    const ttlSeconds = options.ttlSeconds(session.expiresAt)
    await setTokenIndex({
        adapter: options.adapter,
        tokenHash: session.host.tokenHash,
        pairingId: options.pairingId,
        role: 'host',
        ttlSeconds,
    })
    for (const connection of await loadRemoteConnectionIndex(options.adapter, options.pairingId)) {
        await setTokenIndex({
            adapter: options.adapter,
            connectionId: connection.connectionId,
            tokenHash: connection.tokenHash,
            pairingId: options.pairingId,
            role: 'guest',
            ttlSeconds,
        })
    }
    return session
}
