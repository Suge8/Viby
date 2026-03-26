import type { DecryptedMessage } from '@/types/api'
import {
    readBrowserStorageJson,
    removeBrowserStorageItem,
    writeBrowserStorageJson
} from '@/lib/browserStorage'
import { registerWarmSnapshotLifecycleFlush } from '@/lib/warmSnapshotLifecycle'

const MESSAGE_WINDOW_WARM_STORAGE = 'local'
const MESSAGE_WINDOW_WARM_SNAPSHOT_PREFIX = 'viby:message-window-warm:'
const MESSAGE_WINDOW_WARM_SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1_000
const MESSAGE_WINDOW_WARM_SNAPSHOT_WRITE_DEBOUNCE_MS = 160

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
    timeoutId: ReturnType<typeof setTimeout> | null
}

const pendingWarmSnapshots = new Map<string, PendingWarmSnapshotEntry>()
let warmSnapshotFlushRegistered = false

function getMessageWindowWarmSnapshotKey(sessionId: string): string {
    return `${MESSAGE_WINDOW_WARM_SNAPSHOT_PREFIX}${sessionId}`
}

function isFreshSnapshot(record: MessageWindowWarmSnapshotRecord, now: number = Date.now()): boolean {
    return now - record.at <= MESSAGE_WINDOW_WARM_SNAPSHOT_MAX_AGE_MS
}

function parseMessageWindowWarmSnapshotRecord(rawValue: string): MessageWindowWarmSnapshotRecord | null {
    try {
        const parsed = JSON.parse(rawValue) as Partial<MessageWindowWarmSnapshotRecord>
        const snapshot = parsed.snapshot
        if (
            typeof parsed.at !== 'number'
            || !snapshot
            || typeof snapshot.sessionId !== 'string'
            || !Array.isArray(snapshot.messages)
            || typeof snapshot.hasLoadedLatest !== 'boolean'
            || typeof snapshot.hasMore !== 'boolean'
            || typeof snapshot.historyExpanded !== 'boolean'
            || typeof snapshot.atBottom !== 'boolean'
        ) {
            return null
        }

        return {
            at: parsed.at,
            snapshot: snapshot as MessageWindowWarmSnapshot
        }
    } catch {
        return null
    }
}

function persistWarmSnapshot(sessionId: string, snapshot: MessageWindowWarmSnapshot): void {
    writeBrowserStorageJson(
        MESSAGE_WINDOW_WARM_STORAGE,
        getMessageWindowWarmSnapshotKey(sessionId),
        {
            at: Date.now(),
            snapshot
        }
    )
}

function flushAllWarmSnapshots(): void {
    for (const sessionId of pendingWarmSnapshots.keys()) {
        flushMessageWindowWarmSnapshot(sessionId)
    }
}

function ensureWarmSnapshotFlushRegistered(): void {
    if (warmSnapshotFlushRegistered) {
        return
    }

    registerWarmSnapshotLifecycleFlush(flushAllWarmSnapshots)
    warmSnapshotFlushRegistered = true
}

export function scheduleMessageWindowWarmSnapshot(snapshot: MessageWindowWarmSnapshot): void {
    ensureWarmSnapshotFlushRegistered()

    const existing = pendingWarmSnapshots.get(snapshot.sessionId)
    if (existing?.timeoutId) {
        clearTimeout(existing.timeoutId)
    }

    const timeoutId = setTimeout(() => {
        flushMessageWindowWarmSnapshot(snapshot.sessionId)
    }, MESSAGE_WINDOW_WARM_SNAPSHOT_WRITE_DEBOUNCE_MS)

    pendingWarmSnapshots.set(snapshot.sessionId, {
        snapshot,
        timeoutId
    })
}

export function flushMessageWindowWarmSnapshot(sessionId: string): void {
    const entry = pendingWarmSnapshots.get(sessionId)
    if (!entry) {
        return
    }

    if (entry.timeoutId) {
        clearTimeout(entry.timeoutId)
    }

    persistWarmSnapshot(sessionId, entry.snapshot)
    pendingWarmSnapshots.delete(sessionId)
}

export function readMessageWindowWarmSnapshot(sessionId: string): MessageWindowWarmSnapshot | null {
    const snapshot = readBrowserStorageJson({
        storage: MESSAGE_WINDOW_WARM_STORAGE,
        key: getMessageWindowWarmSnapshotKey(sessionId),
        parse: parseMessageWindowWarmSnapshotRecord
    })
    if (!snapshot) {
        return null
    }
    if (!isFreshSnapshot(snapshot)) {
        removeMessageWindowWarmSnapshot(sessionId)
        return null
    }

    return snapshot.snapshot
}

export function removeMessageWindowWarmSnapshot(sessionId: string): void {
    const pending = pendingWarmSnapshots.get(sessionId)
    if (pending?.timeoutId) {
        clearTimeout(pending.timeoutId)
    }
    pendingWarmSnapshots.delete(sessionId)
    removeBrowserStorageItem(MESSAGE_WINDOW_WARM_STORAGE, getMessageWindowWarmSnapshotKey(sessionId))
}
