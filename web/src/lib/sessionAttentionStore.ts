import { normalizeSessionActivityTimestamp } from '@viby/protocol'
import {
    publishAppCacheBroadcast,
    readAppCacheRecord,
    removeAppCacheRecord,
    subscribeAppCacheBroadcast,
    writeAppCacheRecord,
} from '@/lib/storage/appCacheDb'
import { APP_CACHE_STORES } from '@/lib/storage/storageRegistry'

const SESSION_ATTENTION_SNAPSHOT_KEY = 'snapshot'

export type SessionAttentionSnapshot = Record<string, number>

let sessionAttentionSnapshot: SessionAttentionSnapshot = {}
let pendingPersist: Promise<void> = Promise.resolve()

function normalizeTimestamp(value: number | null | undefined): number {
    return normalizeSessionActivityTimestamp(value) ?? 0
}

function normalizeSnapshot(value: unknown): SessionAttentionSnapshot {
    if (!value || typeof value !== 'object') {
        return {}
    }

    return Object.fromEntries(
        Object.entries(value)
            .filter(([sessionId, seenAt]) => typeof sessionId === 'string' && typeof seenAt === 'number')
            .map(([sessionId, seenAt]) => [sessionId, normalizeTimestamp(seenAt)])
            .filter(([, seenAt]) => typeof seenAt === 'number' && seenAt > 0)
    )
}

function cloneSnapshot(snapshot: SessionAttentionSnapshot): SessionAttentionSnapshot {
    return { ...snapshot }
}

function isEmptySnapshot(snapshot: SessionAttentionSnapshot): boolean {
    return Object.keys(snapshot).length === 0
}

function queuePersist(snapshot: SessionAttentionSnapshot): Promise<void> {
    pendingPersist = pendingPersist
        .catch(() => undefined)
        .then(async () => {
            let didPersist = false
            if (isEmptySnapshot(snapshot)) {
                didPersist = await removeAppCacheRecord(
                    APP_CACHE_STORES.sessionAttention,
                    SESSION_ATTENTION_SNAPSHOT_KEY
                )
            } else {
                didPersist = await writeAppCacheRecord(
                    APP_CACHE_STORES.sessionAttention,
                    SESSION_ATTENTION_SNAPSHOT_KEY,
                    {
                        snapshot,
                    }
                )
            }
            if (didPersist) {
                publishAppCacheBroadcast({ type: 'session-attention-updated' })
            }
        })

    return pendingPersist
}

export function getNextSessionAttentionSeenSnapshot(
    snapshot: SessionAttentionSnapshot,
    sessionId: string,
    seenAt: number
): SessionAttentionSnapshot {
    const normalizedSeenAt = normalizeTimestamp(seenAt)
    if (normalizedSeenAt === 0) {
        return snapshot
    }

    const currentSeenAt = snapshot[sessionId] ?? 0
    if (normalizedSeenAt <= currentSeenAt) {
        return snapshot
    }

    return {
        ...snapshot,
        [sessionId]: normalizedSeenAt,
    }
}

export async function hydrateSessionAttentionFromAppCache(): Promise<void> {
    const record = await readAppCacheRecord(APP_CACHE_STORES.sessionAttention, SESSION_ATTENTION_SNAPSHOT_KEY)
    sessionAttentionSnapshot = normalizeSnapshot(record?.snapshot)
    if (record && isEmptySnapshot(sessionAttentionSnapshot)) {
        await removeAppCacheRecord(APP_CACHE_STORES.sessionAttention, SESSION_ATTENTION_SNAPSHOT_KEY)
    }
}

export function readSessionAttentionSnapshot(): SessionAttentionSnapshot {
    return cloneSnapshot(sessionAttentionSnapshot)
}

export function subscribeSessionAttentionSnapshot(callback: () => void): () => void {
    return subscribeAppCacheBroadcast((event) => {
        if (event.type !== 'session-attention-updated') {
            return
        }

        void hydrateSessionAttentionFromAppCache().then(callback)
    })
}

export function applySessionAttentionSnapshot(nextSnapshot: SessionAttentionSnapshot): void {
    sessionAttentionSnapshot = cloneSnapshot(nextSnapshot)
    void queuePersist(nextSnapshot)
}

export async function seedSessionAttentionSnapshotForTests(snapshot: SessionAttentionSnapshot): Promise<void> {
    sessionAttentionSnapshot = normalizeSnapshot(snapshot)
    await queuePersist(sessionAttentionSnapshot)
    await hydrateSessionAttentionFromAppCache()
}

export async function resetSessionAttentionStoreForTests(): Promise<void> {
    await pendingPersist.catch(() => undefined)
    sessionAttentionSnapshot = {}
    pendingPersist = Promise.resolve()
}
