import { readAllAppCacheRecords, removeAppCacheRecord, writeAppCacheRecord } from '@/lib/storage/appCacheDb'
import { APP_CACHE_STORES } from '@/lib/storage/storageRegistry'
import { isWarmSnapshotFresh, WARM_SNAPSHOT_WRITE_DEBOUNCE_MS } from '@/lib/warmSnapshotPolicy'
import { createWarmSnapshotWriteScheduler } from '@/lib/warmSnapshotWriteScheduler'
import type { Session, SessionResponse } from '@/types/api'

type SessionWarmSnapshotRecord = Readonly<{
    at: number
    session: Session
}>

type PendingSessionWarmSnapshotEntry = {
    at: number
    session: Session
    fingerprint: string
}

const pendingSessionWarmSnapshots = new Map<string, PendingSessionWarmSnapshotEntry>()
const persistedSessionWarmSnapshots = new Map<string, SessionWarmSnapshotRecord>()
const persistedSessionWarmSnapshotFingerprints = new Map<string, string>()
const pendingPersistPromises = new Map<string, Promise<void>>()
const sessionWarmSnapshotScheduler = createWarmSnapshotWriteScheduler<string>({
    debounceMs: WARM_SNAPSHOT_WRITE_DEBOUNCE_MS,
    flush: (sessionId) => {
        const pending = pendingSessionWarmSnapshots.get(sessionId)
        if (!pending) {
            return
        }

        if (persistedSessionWarmSnapshotFingerprints.get(sessionId) === pending.fingerprint) {
            pendingSessionWarmSnapshots.delete(sessionId)
            return
        }

        void persistSessionWarmSnapshot(
            {
                at: pending.at,
                session: pending.session,
            },
            pending.fingerprint
        )
        pendingSessionWarmSnapshots.delete(sessionId)
    },
})

function isFreshSnapshot(snapshot: SessionWarmSnapshotRecord, now: number = Date.now()): boolean {
    return isWarmSnapshotFresh(snapshot.at, now)
}

export function serializeSessionWarmSnapshotFingerprint(session: Session): string {
    const resumableSession = session as Session & { resumeAvailable?: boolean }
    return JSON.stringify({
        id: session.id,
        seq: session.seq,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        active: session.active,
        activeAt: session.activeAt,
        metadataVersion: session.metadataVersion,
        agentStateVersion: session.agentStateVersion,
        thinking: session.thinking,
        thinkingAt: session.thinkingAt,
        model: session.model,
        modelReasoningEffort: session.modelReasoningEffort,
        permissionMode: session.permissionMode,
        collaborationMode: session.collaborationMode,
        todos: session.todos ?? null,
        resumeAvailable: resumableSession.resumeAvailable ?? null,
    })
}

async function persistSessionWarmSnapshot(record: SessionWarmSnapshotRecord, fingerprint: string): Promise<void> {
    persistedSessionWarmSnapshots.set(record.session.id, record)
    persistedSessionWarmSnapshotFingerprints.set(record.session.id, fingerprint)
    const persistPromise = writeAppCacheRecord(APP_CACHE_STORES.sessionWarm, record.session.id, {
        at: record.at,
        session: record.session,
        fingerprint,
    })
        .then(() => undefined)
        .finally(() => {
            if (pendingPersistPromises.get(record.session.id) === persistPromise) {
                pendingPersistPromises.delete(record.session.id)
            }
        })
    pendingPersistPromises.set(record.session.id, persistPromise)
    await persistPromise
}

export async function hydrateSessionWarmSnapshotsFromAppCache(): Promise<void> {
    const records = await readAllAppCacheRecords(APP_CACHE_STORES.sessionWarm)
    const now = Date.now()
    persistedSessionWarmSnapshots.clear()
    persistedSessionWarmSnapshotFingerprints.clear()

    await Promise.all(
        records.map(async ([sessionId, record]) => {
            if (
                typeof record?.at !== 'number' ||
                typeof record?.fingerprint !== 'string' ||
                !record.session ||
                (record.session as { id?: unknown }).id !== sessionId
            ) {
                await removeAppCacheRecord(APP_CACHE_STORES.sessionWarm, sessionId)
                return
            }

            const snapshot = {
                at: record.at,
                session: record.session as Session,
            } satisfies SessionWarmSnapshotRecord
            if (!isFreshSnapshot(snapshot, now)) {
                await removeAppCacheRecord(APP_CACHE_STORES.sessionWarm, sessionId)
                return
            }

            persistedSessionWarmSnapshots.set(sessionId, snapshot)
            persistedSessionWarmSnapshotFingerprints.set(sessionId, record.fingerprint)
        })
    )
}

export function writeSessionWarmSnapshot(session: Session): void {
    const fingerprint = serializeSessionWarmSnapshotFingerprint(session)
    const existing = pendingSessionWarmSnapshots.get(session.id)
    if (existing?.fingerprint === fingerprint) {
        return
    }
    if (persistedSessionWarmSnapshotFingerprints.get(session.id) === fingerprint) {
        return
    }

    const entry: PendingSessionWarmSnapshotEntry = {
        at: Date.now(),
        session,
        fingerprint,
    }

    pendingSessionWarmSnapshots.set(session.id, entry)
    sessionWarmSnapshotScheduler.schedule(session.id)
}

export function flushSessionWarmSnapshot(sessionId: string): void {
    sessionWarmSnapshotScheduler.cancel(sessionId)
    const pending = pendingSessionWarmSnapshots.get(sessionId)
    if (!pending) {
        return
    }

    if (persistedSessionWarmSnapshotFingerprints.get(sessionId) === pending.fingerprint) {
        pendingSessionWarmSnapshots.delete(sessionId)
        return
    }

    void persistSessionWarmSnapshot(
        {
            at: pending.at,
            session: pending.session,
        },
        pending.fingerprint
    )
    pendingSessionWarmSnapshots.delete(sessionId)
}

export function readSessionWarmSnapshot(sessionId: string): SessionResponse | undefined {
    const pending = pendingSessionWarmSnapshots.get(sessionId)
    if (pending) {
        if (!isFreshSnapshot({ at: pending.at, session: pending.session })) {
            removeSessionWarmSnapshot(sessionId)
            return undefined
        }

        return {
            session: pending.session,
        }
    }

    const snapshot = persistedSessionWarmSnapshots.get(sessionId)
    if (!snapshot) {
        return undefined
    }
    if (!isFreshSnapshot(snapshot)) {
        removeSessionWarmSnapshot(sessionId)
        return undefined
    }

    return {
        session: snapshot.session,
    }
}

export function removeSessionWarmSnapshot(sessionId: string): void {
    sessionWarmSnapshotScheduler.cancel(sessionId)
    pendingSessionWarmSnapshots.delete(sessionId)
    persistedSessionWarmSnapshots.delete(sessionId)
    persistedSessionWarmSnapshotFingerprints.delete(sessionId)
    void removeAppCacheRecord(APP_CACHE_STORES.sessionWarm, sessionId)
}

export async function resetSessionWarmSnapshotForTests(): Promise<void> {
    sessionWarmSnapshotScheduler.reset()
    pendingSessionWarmSnapshots.clear()
    persistedSessionWarmSnapshots.clear()
    persistedSessionWarmSnapshotFingerprints.clear()
    await Promise.all(
        [...pendingPersistPromises.values()].map((persistPromise) => persistPromise.catch(() => undefined))
    )
    pendingPersistPromises.clear()
}
