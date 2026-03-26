import type { SessionsResponse, SessionSummary } from '@/types/api'
import {
    readBrowserStorageJson,
    removeBrowserStorageItem,
    writeBrowserStorageJson
} from '@/lib/browserStorage'
import { registerWarmSnapshotLifecycleFlush } from '@/lib/warmSnapshotLifecycle'

const SESSIONS_WARM_SNAPSHOT_STORAGE = 'local'
const SESSIONS_WARM_SNAPSHOT_KEY = 'viby:sessions-warm'
const SESSIONS_WARM_SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1_000
const SESSIONS_WARM_SNAPSHOT_WRITE_DEBOUNCE_MS = 160

type SessionsWarmSnapshotRecord = Readonly<{
    at: number
    sessions: SessionSummary[]
}>

type PendingSessionsWarmSnapshotEntry = {
    at: number
    sessions: SessionSummary[]
    timeoutId: ReturnType<typeof setTimeout> | null
}

let pendingSessionsWarmSnapshot: PendingSessionsWarmSnapshotEntry | null = null
let lifecycleFlushRegistered = false

function isFreshSnapshot(snapshot: SessionsWarmSnapshotRecord, now: number = Date.now()): boolean {
    return now - snapshot.at <= SESSIONS_WARM_SNAPSHOT_MAX_AGE_MS
}

function parseSessionsWarmSnapshotRecord(rawValue: string): SessionsWarmSnapshotRecord | null {
    try {
        const parsed = JSON.parse(rawValue) as Partial<SessionsWarmSnapshotRecord>
        if (typeof parsed.at !== 'number' || !Array.isArray(parsed.sessions)) {
            return null
        }

        return {
            at: parsed.at,
            sessions: parsed.sessions as SessionSummary[]
        }
    } catch {
        return null
    }
}

function persistSessionsWarmSnapshot(record: SessionsWarmSnapshotRecord): void {
    writeBrowserStorageJson(
        SESSIONS_WARM_SNAPSHOT_STORAGE,
        SESSIONS_WARM_SNAPSHOT_KEY,
        record
    )
}

function flushAllSessionsWarmSnapshots(): void {
    flushSessionsWarmSnapshot()
}

function ensureWarmSnapshotLifecycleFlushRegistered(): void {
    if (lifecycleFlushRegistered) {
        return
    }

    registerWarmSnapshotLifecycleFlush(flushAllSessionsWarmSnapshots)
    lifecycleFlushRegistered = true
}

export function writeSessionsWarmSnapshot(sessions: SessionSummary[]): void {
    ensureWarmSnapshotLifecycleFlushRegistered()

    if (pendingSessionsWarmSnapshot?.timeoutId) {
        clearTimeout(pendingSessionsWarmSnapshot.timeoutId)
    }

    pendingSessionsWarmSnapshot = {
        at: Date.now(),
        sessions,
        timeoutId: null
    }

    pendingSessionsWarmSnapshot.timeoutId = setTimeout(() => {
        flushSessionsWarmSnapshot()
    }, SESSIONS_WARM_SNAPSHOT_WRITE_DEBOUNCE_MS)
}

export function flushSessionsWarmSnapshot(): void {
    if (!pendingSessionsWarmSnapshot) {
        return
    }

    if (pendingSessionsWarmSnapshot.timeoutId) {
        clearTimeout(pendingSessionsWarmSnapshot.timeoutId)
    }

    persistSessionsWarmSnapshot({
        at: pendingSessionsWarmSnapshot.at,
        sessions: pendingSessionsWarmSnapshot.sessions
    })
    pendingSessionsWarmSnapshot = null
}

export function readSessionsWarmSnapshot(): SessionsResponse | undefined {
    if (pendingSessionsWarmSnapshot) {
        if (!isFreshSnapshot({
            at: pendingSessionsWarmSnapshot.at,
            sessions: pendingSessionsWarmSnapshot.sessions
        })) {
            removeSessionsWarmSnapshot()
            return undefined
        }

        return {
            sessions: pendingSessionsWarmSnapshot.sessions
        }
    }

    const snapshot = readBrowserStorageJson({
        storage: SESSIONS_WARM_SNAPSHOT_STORAGE,
        key: SESSIONS_WARM_SNAPSHOT_KEY,
        parse: parseSessionsWarmSnapshotRecord
    })
    if (!snapshot) {
        return undefined
    }

    if (!isFreshSnapshot(snapshot)) {
        removeSessionsWarmSnapshot()
        return undefined
    }

    return {
        sessions: snapshot.sessions
    }
}

export function removeSessionsWarmSnapshot(): void {
    if (pendingSessionsWarmSnapshot?.timeoutId) {
        clearTimeout(pendingSessionsWarmSnapshot.timeoutId)
    }
    pendingSessionsWarmSnapshot = null
    removeBrowserStorageItem(SESSIONS_WARM_SNAPSHOT_STORAGE, SESSIONS_WARM_SNAPSHOT_KEY)
}
