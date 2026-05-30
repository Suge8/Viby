import { readAppCacheRecord, removeAppCacheRecord, writeAppCacheRecord } from '@/lib/storage/appCacheDb'
import { APP_CACHE_STORES } from '@/lib/storage/storageRegistry'

export type RemotePairingRetainedReady = { lastReadyAt: number }

export async function getRetainedReady(pairingId: string): Promise<RemotePairingRetainedReady | null> {
    return readAppCacheRecord(APP_CACHE_STORES.pairingRetainedReady, pairingId)
}

export const setRetainedReady = (pairingId: string, lastReadyAt: number): Promise<boolean> =>
    writeAppCacheRecord(APP_CACHE_STORES.pairingRetainedReady, pairingId, { lastReadyAt })

export const clearRetainedReady = (pairingId: string): Promise<boolean> =>
    removeAppCacheRecord(APP_CACHE_STORES.pairingRetainedReady, pairingId)
