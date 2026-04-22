import { readAllAppCacheRecords, removeAppCacheRecord, writeAppCacheRecord } from '@/lib/storage/appCacheDb'
import { APP_CACHE_STORES } from '@/lib/storage/storageRegistry'
import { isWarmSnapshotFresh, WARM_SNAPSHOT_WRITE_DEBOUNCE_MS } from '@/lib/warmSnapshotPolicy'
import { createWarmSnapshotWriteScheduler } from '@/lib/warmSnapshotWriteScheduler'
import type { DecryptedMessage } from '@/types/api'

export type MessageWindowWarmSnapshot = Readonly<{
    sessionId: string
    messages: DecryptedMessage[]
    hasLoadedLatest: boolean
    hasMore: boolean
    historyExpanded: boolean
    atBottom: boolean
}>

type MessageWindowWarmSnapshotRecord = Readonly<{
    at: number
    snapshot: MessageWindowWarmSnapshot
}>

type PendingWarmSnapshotEntry = {
    snapshot: MessageWindowWarmSnapshot
}

const pendingWarmSnapshots = new Map<string, PendingWarmSnapshotEntry>()
const persistedWarmSnapshots = new Map<string, MessageWindowWarmSnapshotRecord>()
const pendingPersistPromises = new Map<string, Promise<void>>()
const warmSnapshotScheduler = createWarmSnapshotWriteScheduler<string>({
    debounceMs: WARM_SNAPSHOT_WRITE_DEBOUNCE_MS,
    flush: (sessionId) => {
        const entry = pendingWarmSnapshots.get(sessionId)
        if (!entry) {
            return
        }

        persistWarmSnapshot(sessionId, entry.snapshot)
        pendingWarmSnapshots.delete(sessionId)
    },
})

function isFreshSnapshot(record: MessageWindowWarmSnapshotRecord, now: number = Date.now()): boolean {
    return isWarmSnapshotFresh(record.at, now)
}

function createWarmSnapshotRecord(snapshot: MessageWindowWarmSnapshot): MessageWindowWarmSnapshotRecord {
    return {
        at: Date.now(),
        snapshot,
    }
}

async function persistWarmSnapshot(sessionId: string, snapshot: MessageWindowWarmSnapshot): Promise<void> {
    const record = createWarmSnapshotRecord(snapshot)
    persistedWarmSnapshots.set(sessionId, record)
    const persistPromise = writeAppCacheRecord(APP_CACHE_STORES.messageWindowWarm, sessionId, record)
        .then(() => undefined)
        .finally(() => {
            if (pendingPersistPromises.get(sessionId) === persistPromise) {
                pendingPersistPromises.delete(sessionId)
            }
        })
    pendingPersistPromises.set(sessionId, persistPromise)
    await persistPromise
}

export async function hydrateMessageWindowWarmSnapshotsFromAppCache(): Promise<void> {
    const records = await readAllAppCacheRecords(APP_CACHE_STORES.messageWindowWarm)
    const now = Date.now()
    persistedWarmSnapshots.clear()

    await Promise.all(
        records.map(async ([sessionId, record]) => {
            if (
                typeof record?.at !== 'number' ||
                !record.snapshot ||
                record.snapshot.sessionId !== sessionId ||
                !isFreshSnapshot(record, now)
            ) {
                await removeAppCacheRecord(APP_CACHE_STORES.messageWindowWarm, sessionId)
                return
            }

            persistedWarmSnapshots.set(sessionId, record)
        })
    )
}

export function scheduleMessageWindowWarmSnapshot(snapshot: MessageWindowWarmSnapshot): void {
    pendingWarmSnapshots.set(snapshot.sessionId, {
        snapshot,
    })
    warmSnapshotScheduler.schedule(snapshot.sessionId)
}

export function flushMessageWindowWarmSnapshot(sessionId: string): void {
    warmSnapshotScheduler.cancel(sessionId)
    const entry = pendingWarmSnapshots.get(sessionId)
    if (!entry) return
    void persistWarmSnapshot(sessionId, entry.snapshot)
    pendingWarmSnapshots.delete(sessionId)
}

export function writeMessageWindowWarmSnapshot(snapshot: MessageWindowWarmSnapshot): void {
    const record = createWarmSnapshotRecord(snapshot)
    warmSnapshotScheduler.cancel(snapshot.sessionId)
    pendingWarmSnapshots.delete(snapshot.sessionId)
    persistedWarmSnapshots.set(snapshot.sessionId, record)
}

export function readMessageWindowWarmSnapshot(sessionId: string): MessageWindowWarmSnapshot | null {
    const pending = pendingWarmSnapshots.get(sessionId)
    if (pending) {
        return pending.snapshot
    }

    const persisted = persistedWarmSnapshots.get(sessionId)
    if (!persisted) {
        return null
    }
    if (!isFreshSnapshot(persisted)) {
        removeMessageWindowWarmSnapshot(sessionId)
        return null
    }

    return persisted.snapshot
}

export function removeMessageWindowWarmSnapshot(sessionId: string): void {
    warmSnapshotScheduler.cancel(sessionId)
    pendingWarmSnapshots.delete(sessionId)
    persistedWarmSnapshots.delete(sessionId)
    void removeAppCacheRecord(APP_CACHE_STORES.messageWindowWarm, sessionId)
}

export async function resetMessageWindowWarmSnapshotForTests(): Promise<void> {
    warmSnapshotScheduler.reset()
    pendingWarmSnapshots.clear()
    persistedWarmSnapshots.clear()
    await Promise.all(
        [...pendingPersistPromises.values()].map((persistPromise) => persistPromise.catch(() => undefined))
    )
    pendingPersistPromises.clear()
}
