import type { Session, SessionResponse } from '@/types/api'
import {
    readBrowserStorageJson,
    removeBrowserStorageItem,
    writeBrowserStorageJson
} from '@/lib/browserStorage'
import { registerWarmSnapshotLifecycleFlush } from '@/lib/warmSnapshotLifecycle'

const SESSION_WARM_SNAPSHOT_STORAGE = 'local'
const SESSION_WARM_SNAPSHOT_PREFIX = 'viby:session-warm:'
const SESSION_WARM_SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1_000
const SESSION_WARM_SNAPSHOT_WRITE_DEBOUNCE_MS = 160

type SessionWarmSnapshotRecord = Readonly<{
    at: number
    session: Session
}>

type PendingSessionWarmSnapshotEntry = {
    at: number
    session: Session
    timeoutId: ReturnType<typeof setTimeout> | null
}

const pendingSessionWarmSnapshots = new Map<string, PendingSessionWarmSnapshotEntry>()
let lifecycleFlushRegistered = false

function getSessionWarmSnapshotKey(sessionId: string): string {
    return `${SESSION_WARM_SNAPSHOT_PREFIX}${sessionId}`
}

function isFreshSnapshot(snapshot: SessionWarmSnapshotRecord, now: number = Date.now()): boolean {
    return now - snapshot.at <= SESSION_WARM_SNAPSHOT_MAX_AGE_MS
}

function parseSessionWarmSnapshotRecord(rawValue: string): SessionWarmSnapshotRecord | null {
    try {
        const parsed = JSON.parse(rawValue) as Partial<SessionWarmSnapshotRecord>
        if (typeof parsed.at !== 'number' || !parsed.session || typeof parsed.session.id !== 'string') {
            return null
        }

        return {
            at: parsed.at,
            session: parsed.session as Session
        }
    } catch {
        return null
    }
}

function persistSessionWarmSnapshot(record: SessionWarmSnapshotRecord): void {
    writeBrowserStorageJson(
        SESSION_WARM_SNAPSHOT_STORAGE,
        getSessionWarmSnapshotKey(record.session.id),
        record
    )
}

function flushAllSessionWarmSnapshots(): void {
    for (const sessionId of pendingSessionWarmSnapshots.keys()) {
        flushSessionWarmSnapshot(sessionId)
    }
}

function ensureWarmSnapshotLifecycleFlushRegistered(): void {
    if (lifecycleFlushRegistered) {
        return
    }

    registerWarmSnapshotLifecycleFlush(flushAllSessionWarmSnapshots)
    lifecycleFlushRegistered = true
}

export function writeSessionWarmSnapshot(session: Session): void {
    ensureWarmSnapshotLifecycleFlushRegistered()

    const existing = pendingSessionWarmSnapshots.get(session.id)
    if (existing?.timeoutId) {
        clearTimeout(existing.timeoutId)
    }

    const entry: PendingSessionWarmSnapshotEntry = {
        at: Date.now(),
        session,
        timeoutId: null
    }

    entry.timeoutId = setTimeout(() => {
        flushSessionWarmSnapshot(session.id)
    }, SESSION_WARM_SNAPSHOT_WRITE_DEBOUNCE_MS)

    pendingSessionWarmSnapshots.set(session.id, entry)
}

export function flushSessionWarmSnapshot(sessionId: string): void {
    const pending = pendingSessionWarmSnapshots.get(sessionId)
    if (!pending) {
        return
    }

    if (pending.timeoutId) {
        clearTimeout(pending.timeoutId)
    }

    persistSessionWarmSnapshot({
        at: pending.at,
        session: pending.session
    })
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
            session: pending.session
        }
    }

    const snapshot = readBrowserStorageJson({
        storage: SESSION_WARM_SNAPSHOT_STORAGE,
        key: getSessionWarmSnapshotKey(sessionId),
        parse: parseSessionWarmSnapshotRecord
    })
    if (!snapshot) {
        return undefined
    }
    if (!isFreshSnapshot(snapshot)) {
        removeSessionWarmSnapshot(sessionId)
        return undefined
    }

    return {
        session: snapshot.session
    }
}

export function removeSessionWarmSnapshot(sessionId: string): void {
    const pending = pendingSessionWarmSnapshots.get(sessionId)
    if (pending?.timeoutId) {
        clearTimeout(pending.timeoutId)
    }
    pendingSessionWarmSnapshots.delete(sessionId)
    removeBrowserStorageItem(SESSION_WARM_SNAPSHOT_STORAGE, getSessionWarmSnapshotKey(sessionId))
}
