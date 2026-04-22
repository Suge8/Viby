import { readAppCacheRecord, removeAppCacheRecord, writeAppCacheRecord } from '@/lib/storage/appCacheDb'
import { APP_CACHE_STORES } from '@/lib/storage/storageRegistry'
import { isWarmSnapshotFresh, WARM_SNAPSHOT_WRITE_DEBOUNCE_MS } from '@/lib/warmSnapshotPolicy'
import { createWarmSnapshotWriteScheduler } from '@/lib/warmSnapshotWriteScheduler'
import type { SessionSummary, SessionsResponse } from '@/types/api'

type SessionsWarmSnapshotRecord = Readonly<{
    at: number
    sessions: SessionSummary[]
}>

type PendingSessionsWarmSnapshotEntry = Readonly<{
    at: number
    fingerprint: string
    sessions: SessionSummary[]
}>

let pendingSessionsWarmSnapshot: PendingSessionsWarmSnapshotEntry | null = null
let persistedSessionsWarmSnapshot: SessionsWarmSnapshotRecord | null = null
let persistedSessionsWarmSnapshotFingerprint: string | null = null
let pendingPersistPromise: Promise<void> | null = null

const sessionsWarmSnapshotScheduler = createWarmSnapshotWriteScheduler<'sessions'>({
    debounceMs: WARM_SNAPSHOT_WRITE_DEBOUNCE_MS,
    flush: () => {
        if (!pendingSessionsWarmSnapshot) {
            return
        }

        if (persistedSessionsWarmSnapshotFingerprint === pendingSessionsWarmSnapshot.fingerprint) {
            pendingSessionsWarmSnapshot = null
            return
        }

        void persistSessionsWarmSnapshot(
            {
                at: pendingSessionsWarmSnapshot.at,
                sessions: pendingSessionsWarmSnapshot.sessions,
            },
            pendingSessionsWarmSnapshot.fingerprint
        )
        pendingSessionsWarmSnapshot = null
    },
})

function isFreshSnapshot(snapshot: SessionsWarmSnapshotRecord, now: number = Date.now()): boolean {
    return isWarmSnapshotFresh(snapshot.at, now)
}

export function serializeSessionsWarmSnapshotFingerprint(sessions: readonly SessionSummary[]): string {
    return JSON.stringify(
        sessions.map((session) => ({
            active: session.active,
            activeAt: session.activeAt,
            collaborationMode: session.collaborationMode,
            id: session.id,
            latestActivityAt: session.latestActivityAt,
            latestActivityKind: session.latestActivityKind,
            latestCompletedReplyAt: session.latestCompletedReplyAt,
            lifecycleState: session.lifecycleState,
            lifecycleStateSince: session.lifecycleStateSince,
            metadata: session.metadata
                ? {
                      driver: session.metadata.driver,
                      name: session.metadata.name,
                      path: session.metadata.path,
                      summary: session.metadata.summary,
                      worktree: session.metadata.worktree,
                  }
                : null,
            model: session.model,
            modelReasoningEffort: session.modelReasoningEffort,
            pendingRequestsCount: session.pendingRequestsCount,
            permissionMode: session.permissionMode,
            resumeAvailable: session.resumeAvailable,
            thinking: session.thinking,
            todoProgress: session.todoProgress,
            updatedAt: session.updatedAt,
        }))
    )
}

async function persistSessionsWarmSnapshot(record: SessionsWarmSnapshotRecord, fingerprint: string): Promise<void> {
    persistedSessionsWarmSnapshot = record
    persistedSessionsWarmSnapshotFingerprint = fingerprint
    pendingPersistPromise = writeAppCacheRecord(APP_CACHE_STORES.sessionsWarm, 'sessions', {
        at: record.at,
        fingerprint,
        sessions: record.sessions,
    })
        .then(() => undefined)
        .finally(() => {
            pendingPersistPromise = null
        })
    await pendingPersistPromise
}

export async function hydrateSessionsWarmSnapshotFromAppCache(): Promise<void> {
    const record = await readAppCacheRecord(APP_CACHE_STORES.sessionsWarm, 'sessions')
    pendingSessionsWarmSnapshot = null
    persistedSessionsWarmSnapshot = null
    persistedSessionsWarmSnapshotFingerprint = null

    if (
        !record ||
        typeof record.at !== 'number' ||
        typeof record.fingerprint !== 'string' ||
        !Array.isArray(record.sessions)
    ) {
        if (record) {
            await removeAppCacheRecord(APP_CACHE_STORES.sessionsWarm, 'sessions')
        }
        return
    }

    const snapshot = {
        at: record.at,
        sessions: record.sessions,
    } satisfies SessionsWarmSnapshotRecord
    if (!isFreshSnapshot(snapshot)) {
        await removeAppCacheRecord(APP_CACHE_STORES.sessionsWarm, 'sessions')
        return
    }

    persistedSessionsWarmSnapshot = snapshot
    persistedSessionsWarmSnapshotFingerprint = record.fingerprint
}

export function writeSessionsWarmSnapshot(sessions: SessionSummary[]): void {
    const fingerprint = serializeSessionsWarmSnapshotFingerprint(sessions)
    if (pendingSessionsWarmSnapshot?.fingerprint === fingerprint) {
        return
    }
    if (persistedSessionsWarmSnapshotFingerprint === fingerprint) {
        return
    }

    pendingSessionsWarmSnapshot = {
        at: Date.now(),
        fingerprint,
        sessions,
    }
    sessionsWarmSnapshotScheduler.schedule('sessions')
}

export function flushSessionsWarmSnapshot(): void {
    sessionsWarmSnapshotScheduler.cancel('sessions')
    if (!pendingSessionsWarmSnapshot) {
        return
    }

    if (persistedSessionsWarmSnapshotFingerprint === pendingSessionsWarmSnapshot.fingerprint) {
        pendingSessionsWarmSnapshot = null
        return
    }

    void persistSessionsWarmSnapshot(
        {
            at: pendingSessionsWarmSnapshot.at,
            sessions: pendingSessionsWarmSnapshot.sessions,
        },
        pendingSessionsWarmSnapshot.fingerprint
    )
    pendingSessionsWarmSnapshot = null
}

export function readSessionsWarmSnapshot(): SessionsResponse | undefined {
    if (pendingSessionsWarmSnapshot) {
        const snapshot = {
            at: pendingSessionsWarmSnapshot.at,
            sessions: pendingSessionsWarmSnapshot.sessions,
        } satisfies SessionsWarmSnapshotRecord
        if (!isFreshSnapshot(snapshot)) {
            removeSessionsWarmSnapshot()
            return undefined
        }

        return {
            sessions: pendingSessionsWarmSnapshot.sessions,
        }
    }

    if (!persistedSessionsWarmSnapshot) {
        return undefined
    }
    if (!isFreshSnapshot(persistedSessionsWarmSnapshot)) {
        removeSessionsWarmSnapshot()
        return undefined
    }

    return {
        sessions: persistedSessionsWarmSnapshot.sessions,
    }
}

export function removeSessionsWarmSnapshot(): void {
    sessionsWarmSnapshotScheduler.cancel('sessions')
    pendingSessionsWarmSnapshot = null
    persistedSessionsWarmSnapshot = null
    persistedSessionsWarmSnapshotFingerprint = null
    void removeAppCacheRecord(APP_CACHE_STORES.sessionsWarm, 'sessions')
}

export async function resetSessionsWarmSnapshotForTests(): Promise<void> {
    sessionsWarmSnapshotScheduler.reset()
    pendingSessionsWarmSnapshot = null
    persistedSessionsWarmSnapshot = null
    persistedSessionsWarmSnapshotFingerprint = null
    await pendingPersistPromise?.catch(() => undefined)
    pendingPersistPromise = null
}
