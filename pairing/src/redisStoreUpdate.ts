import type { PairingSessionRecord } from '@viby/protocol/pairing'
import { clearSessionSideKeys } from './redisStoreIndexSupport'
import { loadStoredSessionEntry, replaceStoredSession } from './redisStoreSessionSupport'
import { cloneSession, expireIfNeeded } from './storeSupport'
import type { RedisPairingAdapter } from './storeTypes'

const SESSION_UPDATE_RETRY_LIMIT = 5

export async function updateRedisPairingSession(options: {
    adapter: RedisPairingAdapter
    now: () => number
    pairingId: string
    ttlSeconds: (expiresAt: number) => number
    mutate: (session: PairingSessionRecord) => Promise<PairingSessionRecord | null>
}): Promise<PairingSessionRecord | null> {
    for (let attempt = 0; attempt < SESSION_UPDATE_RETRY_LIMIT; attempt += 1) {
        const entry = await loadStoredSessionEntry(options.adapter, options.pairingId)
        if (!entry) return null
        const current = expireIfNeeded(entry.session, options.now(), new Map())
        if (current !== entry.session) {
            if (current.state === 'expired') await clearSessionSideKeys(options.adapter, entry.session)
            await replaceStoredSession({
                adapter: options.adapter,
                pairingId: options.pairingId,
                expectedRaw: entry.raw,
                next: current,
                ttlSeconds: options.ttlSeconds(current.expiresAt),
            })
            return null
        }
        const next = await options.mutate(current)
        if (!next) return null
        const replaced = await replaceStoredSession({
            adapter: options.adapter,
            pairingId: options.pairingId,
            expectedRaw: entry.raw,
            next,
            ttlSeconds: options.ttlSeconds(next.expiresAt),
        })
        if (replaced) return cloneSession(next)
    }
    return null
}
