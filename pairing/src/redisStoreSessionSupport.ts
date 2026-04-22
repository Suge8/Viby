import { type PairingSessionRecord, PairingSessionRecordSchema } from '@viby/protocol/pairing'
import { sessionKey } from './storeSupport'
import type { RedisPairingAdapter } from './storeTypes'

export async function loadStoredSession(
    adapter: RedisPairingAdapter,
    pairingId: string
): Promise<PairingSessionRecord | null> {
    const raw = await adapter.get(sessionKey(pairingId))
    if (!raw) {
        return null
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        await adapter.del(sessionKey(pairingId))
        return null
    }

    const sessionResult = PairingSessionRecordSchema.safeParse(parsed)
    if (!sessionResult.success) {
        await adapter.del(sessionKey(pairingId))
        return null
    }

    return sessionResult.data
}

export async function replaceStoredSession(options: {
    adapter: RedisPairingAdapter
    pairingId: string
    current: PairingSessionRecord
    next: PairingSessionRecord
    ttlSeconds: number
}): Promise<boolean> {
    return await options.adapter.compareAndSet(
        sessionKey(options.pairingId),
        JSON.stringify(options.current),
        JSON.stringify(options.next),
        {
            ttlSeconds: options.ttlSeconds,
        }
    )
}

export function ttlSecondsFromExpiry(expiresAt: number, now: () => number): number {
    const remaining = Math.ceil((expiresAt - now()) / 1000)
    return Math.max(1, remaining)
}
