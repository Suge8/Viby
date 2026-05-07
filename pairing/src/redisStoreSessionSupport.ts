import { type PairingSessionRecord, PairingSessionRecordSchema } from '@viby/protocol/pairing'
import { sessionKey } from './storeSupport'
import type { RedisPairingAdapter } from './storeTypes'

export interface StoredSessionEntry {
    session: PairingSessionRecord
    raw: string
}

export async function loadStoredSession(
    adapter: RedisPairingAdapter,
    pairingId: string
): Promise<PairingSessionRecord | null> {
    const entry = await loadStoredSessionEntry(adapter, pairingId)
    return entry?.session ?? null
}

export async function loadStoredSessionEntry(
    adapter: RedisPairingAdapter,
    pairingId: string
): Promise<StoredSessionEntry | null> {
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

    return { session: sessionResult.data, raw }
}

export async function replaceStoredSession(options: {
    adapter: RedisPairingAdapter
    pairingId: string
    expectedRaw: string
    next: PairingSessionRecord
    ttlSeconds: number
}): Promise<boolean> {
    return await options.adapter.compareAndSet(
        sessionKey(options.pairingId),
        options.expectedRaw,
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
