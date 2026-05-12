import { readAppCacheRecord, removeAppCacheRecord, writeAppCacheRecord } from '@/lib/storage/appCacheDb'
import { APP_CACHE_STORES } from '@/lib/storage/storageRegistry'

export type RemotePairingRetainedReady = { lastReadyAt: number }

export async function getRetainedReady(pairingId: string): Promise<RemotePairingRetainedReady | null> {
    return await readAppCacheRecord(APP_CACHE_STORES.pairingRetainedReady, pairingId)
}

export async function setRetainedReady(pairingId: string, lastReadyAt: number): Promise<void> {
    await writeAppCacheRecord(APP_CACHE_STORES.pairingRetainedReady, pairingId, { lastReadyAt })
}

export async function clearRetainedReady(pairingId: string): Promise<void> {
    await removeAppCacheRecord(APP_CACHE_STORES.pairingRetainedReady, pairingId)
}
