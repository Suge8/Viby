import type { PairingSessionRecord } from '@viby/protocol/pairing'
import { setTokenIndex } from './redisStoreIndexSupport'
import { isActiveState } from './storeSupport'
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
        if (!isActiveState(current.state)) return null
        return { ...current, expiresAt: Math.max(current.expiresAt, options.expiresAt), updatedAt: options.at }
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
    if (session.guest) {
        await setTokenIndex({
            adapter: options.adapter,
            tokenHash: session.guest.tokenHash,
            pairingId: options.pairingId,
            role: 'guest',
            ttlSeconds,
        })
    }
    return session
}
