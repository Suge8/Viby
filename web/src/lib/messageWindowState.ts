import { extractAssistantMessageStreamId } from '@viby/protocol'
import type { DecryptedMessage, MessageStatus, SessionStreamState } from '@/types/api'
import { normalizeDecryptedMessage } from '@/chat/normalize'
import { isCliOutputText } from '@/chat/reducerCliOutput'
import {
    readMessageWindowWarmSnapshot,
    type MessageWindowWarmSnapshot
} from '@/lib/messageWindowWarmSnapshot'
import { isUserMessage, mergeMessages } from '@/lib/messages'
import {
    MESSAGE_WINDOW_PENDING_OVERFLOW_WARNING_KEY,
    type MessageWindowWarningKey
} from '@/lib/messageWindowWarnings'

export type PendingReplyPhase = 'sending' | 'preparing'

export type PendingReplyState = Readonly<{
    localId: string
    requestStartedAt: number
    serverAcceptedAt: number | null
    phase: PendingReplyPhase
}>

export type MessageWindowState = {
    sessionId: string
    messages: DecryptedMessage[]
    pending: DecryptedMessage[]
    pendingCount: number
    hasLoadedLatest: boolean
    hasMore: boolean
    oldestSeq: number | null
    newestSeq: number | null
    isLoading: boolean
    isLoadingMore: boolean
    warning: MessageWindowWarningKey | null
    atBottom: boolean
    messagesVersion: number
    pendingReply: PendingReplyState | null
    stream: SessionStreamState | null
    streamVersion: number
    restoredFromWarmSnapshot: boolean
}

export type LoadMoreMessagesResult = Readonly<{
    didLoadOlderMessages: boolean
}>

export const VISIBLE_WINDOW_SIZE = 400
export const PENDING_WINDOW_SIZE = 200
export type InternalState = MessageWindowState & {
    pendingOverflowCount: number
    pendingVisibleCount: number
    pendingOverflowVisibleCount: number
    historyExpanded: boolean
}

type BuildStateUpdates = {
    messages?: DecryptedMessage[]
    pending?: DecryptedMessage[]
    pendingOverflowCount?: number
    pendingVisibleCount?: number
    pendingOverflowVisibleCount?: number
    hasLoadedLatest?: boolean
    hasMore?: boolean
    isLoading?: boolean
    isLoadingMore?: boolean
    warning?: MessageWindowWarningKey | null
    atBottom?: boolean
    historyExpanded?: boolean
    pendingReply?: PendingReplyState | null
    stream?: SessionStreamState | null
    restoredFromWarmSnapshot?: boolean
}

type PendingVisibilityCacheEntry = {
    source: DecryptedMessage
    visible: boolean
}

const pendingVisibilityCacheBySession = new Map<string, Map<string, PendingVisibilityCacheEntry>>()

export function createPendingReplyState(options: {
    localId: string
    requestStartedAt: number
    phase: PendingReplyPhase
    serverAcceptedAt?: number | null
}): PendingReplyState {
    return {
        localId: options.localId,
        requestStartedAt: options.requestStartedAt,
        serverAcceptedAt: options.serverAcceptedAt ?? null,
        phase: options.phase
    }
}

function getPendingVisibilityCache(sessionId: string): Map<string, PendingVisibilityCacheEntry> {
    const existing = pendingVisibilityCacheBySession.get(sessionId)
    if (existing) {
        return existing
    }

    const created = new Map<string, PendingVisibilityCacheEntry>()
    pendingVisibilityCacheBySession.set(sessionId, created)
    return created
}

export function clearPendingVisibilityCache(sessionId: string): void {
    pendingVisibilityCacheBySession.delete(sessionId)
}

function isVisiblePendingMessage(sessionId: string, message: DecryptedMessage): boolean {
    const cache = getPendingVisibilityCache(sessionId)
    const cached = cache.get(message.id)
    if (cached && cached.source === message) {
        return cached.visible
    }

    const visible = normalizeDecryptedMessage(message) !== null
    cache.set(message.id, { source: message, visible })
    return visible
}

function countVisiblePendingMessages(sessionId: string, messages: DecryptedMessage[]): number {
    let count = 0
    for (const message of messages) {
        if (isVisiblePendingMessage(sessionId, message)) {
            count += 1
        }
    }
    return count
}

function syncPendingVisibilityCache(sessionId: string, pending: DecryptedMessage[]): void {
    const cache = pendingVisibilityCacheBySession.get(sessionId)
    if (!cache) {
        return
    }

    const keep = new Set(pending.map((message) => message.id))
    for (const id of cache.keys()) {
        if (!keep.has(id)) {
            cache.delete(id)
        }
    }
}

export function createEmptyState(sessionId: string): InternalState {
    return {
        sessionId,
        messages: [],
        pending: [],
        pendingCount: 0,
        hasLoadedLatest: false,
        pendingVisibleCount: 0,
        pendingOverflowVisibleCount: 0,
        hasMore: false,
        oldestSeq: null,
        newestSeq: null,
        isLoading: false,
        isLoadingMore: false,
        warning: null,
        atBottom: true,
        messagesVersion: 0,
        pendingReply: null,
        stream: null,
        streamVersion: 0,
        restoredFromWarmSnapshot: false,
        pendingOverflowCount: 0,
        historyExpanded: false,
    }
}

function deriveSeqBounds(messages: DecryptedMessage[]): { oldestSeq: number | null; newestSeq: number | null } {
    let oldest: number | null = null
    let newest: number | null = null

    for (const message of messages) {
        if (typeof message.seq !== 'number') {
            continue
        }
        if (oldest === null || message.seq < oldest) {
            oldest = message.seq
        }
        if (newest === null || message.seq > newest) {
            newest = message.seq
        }
    }

    return { oldestSeq: oldest, newestSeq: newest }
}

export function createWarmSnapshot(state: InternalState): MessageWindowWarmSnapshot {
    return {
        sessionId: state.sessionId,
        messages: [...state.messages],
        hasLoadedLatest: state.hasLoadedLatest,
        hasMore: state.hasMore,
        historyExpanded: state.historyExpanded,
        atBottom: state.atBottom
    }
}

export function restoreWarmSnapshotState(sessionId: string): InternalState | null {
    const snapshot = readMessageWindowWarmSnapshot(sessionId)
    if (!snapshot) {
        return null
    }

    const base = createEmptyState(sessionId)
    const { oldestSeq, newestSeq } = deriveSeqBounds(snapshot.messages)
    return {
        ...base,
        messages: [...snapshot.messages],
        hasLoadedLatest: snapshot.hasLoadedLatest,
        hasMore: snapshot.hasMore,
        atBottom: snapshot.atBottom,
        oldestSeq,
        newestSeq,
        messagesVersion: snapshot.messages.length > 0 ? 1 : 0,
        historyExpanded: snapshot.historyExpanded,
        restoredFromWarmSnapshot: true
    }
}

export function resolveStreamAfterMessages(
    stream: SessionStreamState | null,
    messages: DecryptedMessage[]
): SessionStreamState | null {
    if (!stream) {
        return null
    }

    for (const message of messages) {
        if (extractAssistantMessageStreamId(message.content) === stream.streamId) {
            return null
        }
    }

    return stream
}

export function resolvePendingReplyAfterMessages(
    pendingReply: PendingReplyState | null,
    messages: readonly DecryptedMessage[]
): PendingReplyState | null {
    if (!pendingReply) {
        return null
    }

    for (const message of messages) {
        if (isUserMessage(message)) {
            continue
        }
        if (message.createdAt >= pendingReply.requestStartedAt) {
            return null
        }
    }

    return pendingReply
}

export function buildState(prev: InternalState, updates: BuildStateUpdates): InternalState {
    const messages = updates.messages ?? prev.messages
    const pending = updates.pending ?? prev.pending
    const stream = updates.stream !== undefined ? updates.stream : prev.stream
    const pendingOverflowCount = updates.pendingOverflowCount ?? prev.pendingOverflowCount
    const pendingOverflowVisibleCount = updates.pendingOverflowVisibleCount ?? prev.pendingOverflowVisibleCount
    let pendingVisibleCount = updates.pendingVisibleCount ?? prev.pendingVisibleCount
    const pendingChanged = pending !== prev.pending

    if (pendingChanged && updates.pendingVisibleCount === undefined) {
        pendingVisibleCount = countVisiblePendingMessages(prev.sessionId, pending)
    }
    if (pendingChanged) {
        syncPendingVisibilityCache(prev.sessionId, pending)
    }

    const pendingCount = pendingVisibleCount + pendingOverflowVisibleCount
    const { oldestSeq, newestSeq } = deriveSeqBounds(messages)
    const messagesVersion = messages === prev.messages ? prev.messagesVersion : prev.messagesVersion + 1
    const streamVersion = stream === prev.stream ? prev.streamVersion : prev.streamVersion + 1

    return {
        ...prev,
        messages,
        pending,
        pendingOverflowCount,
        pendingVisibleCount,
        pendingOverflowVisibleCount,
        pendingCount,
        hasLoadedLatest: updates.hasLoadedLatest !== undefined ? updates.hasLoadedLatest : prev.hasLoadedLatest,
        oldestSeq,
        newestSeq,
        hasMore: updates.hasMore !== undefined ? updates.hasMore : prev.hasMore,
        isLoading: updates.isLoading !== undefined ? updates.isLoading : prev.isLoading,
        isLoadingMore: updates.isLoadingMore !== undefined ? updates.isLoadingMore : prev.isLoadingMore,
        warning: updates.warning !== undefined ? updates.warning : prev.warning,
        atBottom: updates.atBottom !== undefined ? updates.atBottom : prev.atBottom,
        messagesVersion,
        pendingReply: updates.pendingReply !== undefined ? updates.pendingReply : prev.pendingReply,
        stream,
        streamVersion,
        restoredFromWarmSnapshot: updates.restoredFromWarmSnapshot !== undefined
            ? updates.restoredFromWarmSnapshot
            : prev.restoredFromWarmSnapshot,
        historyExpanded: updates.historyExpanded !== undefined ? updates.historyExpanded : prev.historyExpanded,
    }
}

export function applyVisibleWindow(
    prev: InternalState,
    messages: DecryptedMessage[],
    mode: 'append' | 'prepend'
): DecryptedMessage[] {
    if (prev.historyExpanded) {
        return messages
    }

    return trimVisible(messages, mode)
}

function trimVisible(messages: DecryptedMessage[], mode: 'append' | 'prepend'): DecryptedMessage[] {
    if (messages.length <= VISIBLE_WINDOW_SIZE) {
        return messages
    }
    if (mode === 'prepend') {
        return messages.slice(0, VISIBLE_WINDOW_SIZE)
    }
    return messages.slice(messages.length - VISIBLE_WINDOW_SIZE)
}

function isHistoryJumpTargetMessage(message: DecryptedMessage): boolean {
    const normalized = normalizeDecryptedMessage(message)
    if (!normalized || normalized.role !== 'user') {
        return false
    }

    return !isCliOutputText(normalized.content.text, normalized.meta)
}

export function batchContainsHistoryJumpTarget(messages: readonly DecryptedMessage[]): boolean {
    for (const message of messages) {
        if (isHistoryJumpTargetMessage(message)) {
            return true
        }
    }

    return false
}

function trimPending(
    sessionId: string,
    messages: DecryptedMessage[]
): { pending: DecryptedMessage[]; dropped: number; droppedVisible: number } {
    if (messages.length <= PENDING_WINDOW_SIZE) {
        return { pending: messages, dropped: 0, droppedVisible: 0 }
    }

    const cutoff = messages.length - PENDING_WINDOW_SIZE
    const droppedMessages = messages.slice(0, cutoff)
    const pending = messages.slice(cutoff)
    const droppedVisible = countVisiblePendingMessages(sessionId, droppedMessages)
    return { pending, dropped: droppedMessages.length, droppedVisible }
}

export function filterPendingAgainstVisible(
    pending: DecryptedMessage[],
    visible: DecryptedMessage[]
): DecryptedMessage[] {
    if (pending.length === 0 || visible.length === 0) {
        return pending
    }

    const visibleIds = new Set(visible.map((message) => message.id))
    return pending.filter((message) => !visibleIds.has(message.id))
}

export function isOptimisticMessage(message: DecryptedMessage): boolean {
    return Boolean(message.localId && message.id === message.localId)
}

export function mergeIntoPending(prev: InternalState, incoming: DecryptedMessage[]): {
    pending: DecryptedMessage[]
    pendingVisibleCount: number
    pendingOverflowCount: number
    pendingOverflowVisibleCount: number
    warning: MessageWindowWarningKey | null
} {
    if (incoming.length === 0) {
        return {
            pending: prev.pending,
            pendingVisibleCount: prev.pendingVisibleCount,
            pendingOverflowCount: prev.pendingOverflowCount,
            pendingOverflowVisibleCount: prev.pendingOverflowVisibleCount,
            warning: prev.warning
        }
    }

    const mergedPending = mergeMessages(prev.pending, incoming)
    const filtered = filterPendingAgainstVisible(mergedPending, prev.messages)
    const { pending, dropped, droppedVisible } = trimPending(prev.sessionId, filtered)
    const pendingVisibleCount = countVisiblePendingMessages(prev.sessionId, pending)
    const pendingOverflowCount = prev.pendingOverflowCount + dropped
    const pendingOverflowVisibleCount = prev.pendingOverflowVisibleCount + droppedVisible
    const warning = droppedVisible > 0 && !prev.warning
        ? MESSAGE_WINDOW_PENDING_OVERFLOW_WARNING_KEY
        : prev.warning

    return {
        pending,
        pendingVisibleCount,
        pendingOverflowCount,
        pendingOverflowVisibleCount,
        warning
    }
}
