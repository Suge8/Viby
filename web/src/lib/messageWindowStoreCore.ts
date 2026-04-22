import { createMessageWindowSnapshotRuntime } from '@/lib/messageWindowSnapshotRuntime'
import {
    buildState,
    clearPendingVisibilityCache,
    createEmptyState,
    createWarmSnapshot,
    type InternalState,
    type LoadMoreMessagesResult,
    type MessageWindowState,
    type PendingReplyState,
    restoreWarmSnapshotState,
} from '@/lib/messageWindowState'
import {
    applyAppendedOptimisticMessage,
    applyClearedPendingReply,
    applyClearedSessionStream,
    applyFlushedPendingMessages,
    applyIncomingMessages,
    applyMessageStatusUpdate,
    applyPendingReplyAccepted,
    applySessionReplyingState,
    applySessionStreamUpdate,
} from '@/lib/messageWindowStoreReducers'
import { createMessageWindowNotifier, createMessageWindowStateEvictor } from '@/lib/messageWindowStoreSignals'
import {
    flushMessageWindowWarmSnapshot,
    removeMessageWindowWarmSnapshot,
    scheduleMessageWindowWarmSnapshot,
} from '@/lib/messageWindowWarmSnapshot'
import type { MessageWindowWarningKey } from '@/lib/messageWindowWarnings'
import { MESSAGE_WINDOW_PENDING_OVERFLOW_WARNING_KEY } from '@/lib/messageWindowWarnings'
import type { DecryptedMessage, MessageStatus, SessionStreamState } from '@/types/api'

export type {
    InternalState,
    LoadMoreMessagesResult,
    MessageWindowState,
    PendingReplyState,
} from '@/lib/messageWindowState'

export type SessionReplyingState = Readonly<{
    pendingReply: PendingReplyState | null
    stream: SessionStreamState | null
}>

export type MessageWindowSetStateOptions = Readonly<{
    immediate?: boolean
    persistWarmSnapshot?: boolean
}>

const states = new Map<string, InternalState>()
const listeners = new Map<string, Set<() => void>>()
const notifier = createMessageWindowNotifier(listeners)
const stateEvictor = createMessageWindowStateEvictor(listeners, (sessionId) => {
    states.delete(sessionId)
    clearPendingVisibilityCache(sessionId)
})
const snapshotRuntime = createMessageWindowSnapshotRuntime(states)

function createState(sessionId: string): InternalState {
    snapshotRuntime.registerLifecycle()
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
    notifier.notify(sessionId)
}

function notifyImmediate(sessionId: string): void {
    notifier.notifyImmediate(sessionId)
}

function setState(sessionId: string, next: InternalState, options: MessageWindowSetStateOptions = {}): void {
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
    stateEvictor.clear(sessionId)
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
            stateEvictor.schedule(sessionId)
        }
    }
}

export function clearMessageWindow(sessionId: string): void {
    stateEvictor.clear(sessionId)
    clearPendingVisibilityCache(sessionId)
    if (!states.has(sessionId)) {
        return
    }
    setState(sessionId, createEmptyState(sessionId), {
        immediate: true,
        persistWarmSnapshot: false,
    })
}

export function removeMessageWindow(sessionId: string): void {
    stateEvictor.clear(sessionId)
    clearMessageWindow(sessionId)
    removeMessageWindowWarmSnapshot(sessionId)
    states.delete(sessionId)
    listeners.delete(sessionId)
    clearPendingVisibilityCache(sessionId)
}

export function flushMessageWindowSnapshot(sessionId: string): void {
    if (snapshotRuntime.flushSessionSnapshot(sessionId)) {
        return
    }

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

export function clearSessionStream(sessionId: string, assistantTurnId?: string): void {
    updateMessageWindowState(sessionId, (prev) => applyClearedSessionStream(prev, assistantTurnId))
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
    updateMessageWindowState(
        sessionId,
        (prev) => {
            const result = applyFlushedPendingMessages(prev, MESSAGE_WINDOW_PENDING_OVERFLOW_WARNING_KEY)
            needsRefresh = result.needsRefresh
            return result.state
        },
        { immediate: true }
    )
    return needsRefresh
}

export function setAtBottom(sessionId: string, atBottom: boolean): void {
    updateMessageWindowState(
        sessionId,
        (prev) => {
            if (prev.atBottom === atBottom) {
                return prev
            }
            return buildState(prev, { atBottom })
        },
        {
            immediate: true,
            persistWarmSnapshot: false,
        }
    )
}

export function setMessageWindowWarning(sessionId: string, warning: MessageWindowWarningKey): void {
    updateMessageWindowState(
        sessionId,
        (prev) => {
            if (prev.warning === warning) {
                return prev
            }
            return buildState(prev, { warning })
        },
        { immediate: true }
    )
}

export function clearMessageWindowWarning(sessionId: string, warning?: MessageWindowWarningKey): void {
    updateMessageWindowState(
        sessionId,
        (prev) => {
            if (!prev.warning) {
                return prev
            }
            if (warning && prev.warning !== warning) {
                return prev
            }
            return buildState(prev, { warning: null })
        },
        { immediate: true }
    )
}

export function appendOptimisticMessage(sessionId: string, message: DecryptedMessage): void {
    updateMessageWindowState(sessionId, (prev) => applyAppendedOptimisticMessage(prev, message), { immediate: true })
}

export function markPendingReplyAccepted(sessionId: string, localId: string, acceptedAt: number = Date.now()): void {
    updateMessageWindowState(sessionId, (prev) => applyPendingReplyAccepted(prev, localId, acceptedAt), {
        immediate: true,
    })
}

export function clearPendingReply(sessionId: string, localId?: string): void {
    updateMessageWindowState(sessionId, (prev) => applyClearedPendingReply(prev, localId), { immediate: true })
}

export function getSessionReplyingState(sessionId: string): SessionReplyingState | null {
    const state = states.get(sessionId)
    if (!state) {
        return null
    }

    return {
        pendingReply: state.pendingReply,
        stream: state.stream,
    }
}

export function setSessionReplyingState(sessionId: string, replyingState: SessionReplyingState | null): void {
    if (!states.has(sessionId)) {
        return
    }

    updateMessageWindowState(
        sessionId,
        (prev) =>
            applySessionReplyingState(prev, {
                pendingReply: replyingState?.pendingReply ?? null,
                stream: replyingState?.stream ?? null,
            }),
        { immediate: true }
    )
}

export function updateMessageStatus(sessionId: string, localId: string, status: MessageStatus): void {
    if (!localId) {
        return
    }
    updateMessageWindowState(sessionId, (prev) => applyMessageStatusUpdate(prev, localId, status))
}
