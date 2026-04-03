import type { DecryptedMessage, MessageStatus, SessionStreamState } from '@/types/api'
import {
    flushMessageWindowWarmSnapshot,
    removeMessageWindowWarmSnapshot,
    scheduleMessageWindowWarmSnapshot
} from '@/lib/messageWindowWarmSnapshot'
import { MESSAGE_WINDOW_PENDING_OVERFLOW_WARNING_KEY } from '@/lib/messageWindowWarnings'
import {
    buildState,
    clearPendingVisibilityCache,
    createEmptyState,
    createWarmSnapshot,
    restoreWarmSnapshotState,
    type InternalState,
    type LoadMoreMessagesResult,
    type MessageWindowState,
    type PendingReplyState
} from '@/lib/messageWindowState'
import type { MessageWindowWarningKey } from '@/lib/messageWindowWarnings'
import {
    applyAppendedOptimisticMessage,
    applyClearedPendingReply,
    applyClearedSessionStream,
    applyFlushedPendingMessages,
    applyIncomingMessages,
    applyMessageStatusUpdate,
    applyPendingReplyAccepted,
    applySessionStreamUpdate
} from '@/lib/messageWindowStoreReducers'

export type {
    InternalState,
    LoadMoreMessagesResult,
    MessageWindowState,
    PendingReplyState
} from '@/lib/messageWindowState'

export type MessageWindowSetStateOptions = Readonly<{
    immediate?: boolean
    persistWarmSnapshot?: boolean
}>

const states = new Map<string, InternalState>()
const listeners = new Map<string, Set<() => void>>()
const stateEvictionTimers = new Map<string, ReturnType<typeof setTimeout>>()

// Throttled notification: coalesce rapid state updates into at most one
// notification per NOTIFY_THROTTLE_MS during streaming.
const NOTIFY_THROTTLE_MS = 150
const MESSAGE_WINDOW_STATE_EVICTION_DELAY_MS = 60_000
const pendingNotifySessionIds = new Set<string>()
let notifyRafId: ReturnType<typeof requestAnimationFrame> | null = null
let lastNotifyAt = 0

function scheduleNotify(sessionId: string): void {
    pendingNotifySessionIds.add(sessionId)
    if (notifyRafId !== null) {
        return
    }
    const elapsed = Date.now() - lastNotifyAt
    if (elapsed >= NOTIFY_THROTTLE_MS) {
        notifyRafId = requestAnimationFrame(flushNotifications)
        return
    }

    const remaining = NOTIFY_THROTTLE_MS - elapsed
    setTimeout(() => {
        notifyRafId = requestAnimationFrame(flushNotifications)
    }, remaining)
    notifyRafId = -1 as unknown as ReturnType<typeof requestAnimationFrame>
}

function flushNotifications(): void {
    notifyRafId = null
    lastNotifyAt = Date.now()
    const sessionIds = Array.from(pendingNotifySessionIds)
    pendingNotifySessionIds.clear()
    for (const sessionId of sessionIds) {
        const subs = listeners.get(sessionId)
        if (!subs) {
            continue
        }
        for (const listener of subs) {
            listener()
        }
    }
}

function clearStateEvictionTimer(sessionId: string): void {
    const timerId = stateEvictionTimers.get(sessionId)
    if (!timerId) {
        return
    }

    clearTimeout(timerId)
    stateEvictionTimers.delete(sessionId)
}

function scheduleStateEviction(sessionId: string): void {
    clearStateEvictionTimer(sessionId)
    const timerId = setTimeout(() => {
        stateEvictionTimers.delete(sessionId)
        if ((listeners.get(sessionId)?.size ?? 0) > 0) {
            return
        }

        states.delete(sessionId)
        clearPendingVisibilityCache(sessionId)
    }, MESSAGE_WINDOW_STATE_EVICTION_DELAY_MS)

    stateEvictionTimers.set(sessionId, timerId)
}

function createState(sessionId: string): InternalState {
    return restoreWarmSnapshotState(sessionId) ?? createEmptyState(sessionId)
}

function getState(sessionId: string): InternalState {
    const existing = states.get(sessionId)
    if (existing) {
        return existing
    }

    const created = createState(sessionId)
    states.set(sessionId, created)
    return created
}

function notify(sessionId: string): void {
    scheduleNotify(sessionId)
}

function notifyImmediate(sessionId: string): void {
    const subs = listeners.get(sessionId)
    if (!subs) {
        return
    }
    for (const listener of subs) {
        listener()
    }
}

function setState(
    sessionId: string,
    next: InternalState,
    options: MessageWindowSetStateOptions = {}
): void {
    states.set(sessionId, next)
    if (options.persistWarmSnapshot !== false) {
        scheduleMessageWindowWarmSnapshot(createWarmSnapshot(next))
    }
    if (options.immediate) {
        notifyImmediate(sessionId)
        return
    }
    notify(sessionId)
}

export function getInternalMessageWindowState(sessionId: string): InternalState {
    return getState(sessionId)
}

export function updateMessageWindowState(
    sessionId: string,
    updater: (prev: InternalState) => InternalState,
    options: MessageWindowSetStateOptions = {}
): void {
    const prev = getState(sessionId)
    const next = updater(prev)
    if (next !== prev) {
        setState(sessionId, next, options)
    }
}

export function getMessageWindowState(sessionId: string): MessageWindowState {
    return getState(sessionId)
}

export function subscribeMessageWindow(sessionId: string, listener: () => void): () => void {
    clearStateEvictionTimer(sessionId)
    const subs = listeners.get(sessionId) ?? new Set()
    subs.add(listener)
    listeners.set(sessionId, subs)
    return () => {
        const current = listeners.get(sessionId)
        if (!current) {
            return
        }
        current.delete(listener)
        if (current.size === 0) {
            listeners.delete(sessionId)
            scheduleStateEviction(sessionId)
        }
    }
}

export function clearMessageWindow(sessionId: string): void {
    clearStateEvictionTimer(sessionId)
    clearPendingVisibilityCache(sessionId)
    if (!states.has(sessionId)) {
        return
    }
    setState(sessionId, createEmptyState(sessionId), {
        immediate: true,
        persistWarmSnapshot: false
    })
}

export function removeMessageWindow(sessionId: string): void {
    clearStateEvictionTimer(sessionId)
    clearMessageWindow(sessionId)
    removeMessageWindowWarmSnapshot(sessionId)
    states.delete(sessionId)
    listeners.delete(sessionId)
    clearPendingVisibilityCache(sessionId)
}

export function flushMessageWindowSnapshot(sessionId: string): void {
    flushMessageWindowWarmSnapshot(sessionId)
}

export function seedMessageWindowFromSession(fromSessionId: string, toSessionId: string): void {
    if (!fromSessionId || !toSessionId || fromSessionId === toSessionId) {
        return
    }

    const source = getState(fromSessionId)
    const base = createState(toSessionId)
    const next = buildState(base, {
        messages: [...source.messages],
        pending: [...source.pending],
        pendingOverflowCount: source.pendingOverflowCount,
        pendingVisibleCount: source.pendingVisibleCount,
        pendingOverflowVisibleCount: source.pendingOverflowVisibleCount,
        hasLoadedLatest: source.hasLoadedLatest,
        historyExpanded: source.historyExpanded,
        hasMore: source.hasMore,
        warning: source.warning,
        atBottom: source.atBottom,
        isLoading: false,
        isLoadingMore: false,
        pendingReply: null,
    })
    setState(toSessionId, next)
}

export function applySessionStream(sessionId: string, stream: SessionStreamState): void {
    updateMessageWindowState(sessionId, (prev) => applySessionStreamUpdate(prev, stream))
}

export function clearSessionStream(sessionId: string, streamId?: string): void {
    updateMessageWindowState(sessionId, (prev) => applyClearedSessionStream(prev, streamId))
}

export function ingestIncomingMessages(sessionId: string, incoming: DecryptedMessage[]): void {
    if (incoming.length === 0) {
        return
    }
    updateMessageWindowState(sessionId, (prev) => applyIncomingMessages(prev, incoming))
}

export function flushPendingMessages(sessionId: string): boolean {
    const current = getState(sessionId)
    if (current.pending.length === 0 && current.pendingOverflowVisibleCount === 0) {
        return false
    }

    let needsRefresh = false
    updateMessageWindowState(sessionId, (prev) => {
        const result = applyFlushedPendingMessages(prev, MESSAGE_WINDOW_PENDING_OVERFLOW_WARNING_KEY)
        needsRefresh = result.needsRefresh
        return result.state
    }, { immediate: true })
    return needsRefresh
}

export function setAtBottom(sessionId: string, atBottom: boolean): void {
    updateMessageWindowState(sessionId, (prev) => {
        if (prev.atBottom === atBottom) {
            return prev
        }
        return buildState(prev, { atBottom })
    }, { immediate: true })
}

export function setMessageWindowWarning(sessionId: string, warning: MessageWindowWarningKey): void {
    updateMessageWindowState(sessionId, (prev) => {
        if (prev.warning === warning) {
            return prev
        }
        return buildState(prev, { warning })
    }, { immediate: true })
}

export function clearMessageWindowWarning(sessionId: string, warning?: MessageWindowWarningKey): void {
    updateMessageWindowState(sessionId, (prev) => {
        if (!prev.warning) {
            return prev
        }
        if (warning && prev.warning !== warning) {
            return prev
        }
        return buildState(prev, { warning: null })
    }, { immediate: true })
}

export function appendOptimisticMessage(sessionId: string, message: DecryptedMessage): void {
    updateMessageWindowState(sessionId, (prev) => applyAppendedOptimisticMessage(prev, message), { immediate: true })
}

export function markPendingReplyAccepted(
    sessionId: string,
    localId: string,
    acceptedAt: number = Date.now()
): void {
    updateMessageWindowState(sessionId, (prev) => applyPendingReplyAccepted(prev, localId, acceptedAt), { immediate: true })
}

export function clearPendingReply(sessionId: string, localId?: string): void {
    updateMessageWindowState(sessionId, (prev) => applyClearedPendingReply(prev, localId), { immediate: true })
}

export function updateMessageStatus(sessionId: string, localId: string, status: MessageStatus): void {
    if (!localId) {
        return
    }
    updateMessageWindowState(sessionId, (prev) => applyMessageStatusUpdate(prev, localId, status))
}
