import {
    extractCodexMessageItemId,
    findNextRecoveryCursor,
    SESSION_RECOVERY_PAGE_SIZE,
    SESSION_TIMELINE_PAGE_SIZE
} from '@viby/protocol'
import type { ApiClient } from '@/api/client'
import type { DecryptedMessage, MessageStatus, SessionStreamState } from '@/types/api'
import { normalizeDecryptedMessage } from '@/chat/normalize'
import { isCliOutputText } from '@/chat/reducerCliOutput'
import { isUserMessage, mergeMessages } from '@/lib/messages'

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
    warning: string | null
    atBottom: boolean
    messagesVersion: number
    stream: SessionStreamState | null
    streamVersion: number
}

export type LoadMoreMessagesResult = Readonly<{
    didLoadOlderMessages: boolean
}>

export const VISIBLE_WINDOW_SIZE = 400
export const PENDING_WINDOW_SIZE = 200
const PAGE_SIZE = SESSION_TIMELINE_PAGE_SIZE
const CATCHUP_PAGE_SIZE = SESSION_RECOVERY_PAGE_SIZE
const PENDING_OVERFLOW_WARNING = 'New messages arrived while you were away. Scroll to bottom to refresh.'
const DID_NOT_LOAD_OLDER_MESSAGES_RESULT: LoadMoreMessagesResult = { didLoadOlderMessages: false }

type InternalState = MessageWindowState & {
    pendingOverflowCount: number
    pendingVisibleCount: number
    pendingOverflowVisibleCount: number
    historyExpanded: boolean
}

type PendingVisibilityCacheEntry = {
    source: DecryptedMessage
    visible: boolean
}

const states = new Map<string, InternalState>()
const listeners = new Map<string, Set<() => void>>()
const pendingVisibilityCacheBySession = new Map<string, Map<string, PendingVisibilityCacheEntry>>()

// Throttled notification: coalesce rapid state updates into at most one
// notification per NOTIFY_THROTTLE_MS during streaming. This prevents
// Windows UI jank caused by excessive React re-renders during SSE streaming.
const NOTIFY_THROTTLE_MS = 150
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
        // Enough time has passed — flush on next animation frame
        notifyRafId = requestAnimationFrame(flushNotifications)
    } else {
        // Too soon — delay until the throttle window expires, then use rAF
        const remaining = NOTIFY_THROTTLE_MS - elapsed
        setTimeout(() => {
            notifyRafId = requestAnimationFrame(flushNotifications)
        }, remaining)
        // Use a sentinel so we don't double-schedule
        notifyRafId = -1 as unknown as ReturnType<typeof requestAnimationFrame>
    }
}

function flushNotifications(): void {
    notifyRafId = null
    lastNotifyAt = Date.now()
    const sessionIds = Array.from(pendingNotifySessionIds)
    pendingNotifySessionIds.clear()
    for (const sessionId of sessionIds) {
        const subs = listeners.get(sessionId)
        if (!subs) continue
        for (const listener of subs) {
            listener()
        }
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

function clearPendingVisibilityCache(sessionId: string): void {
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

function createState(sessionId: string): InternalState {
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
        stream: null,
        streamVersion: 0,
        pendingOverflowCount: 0,
        historyExpanded: false,
    }
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
    // Bypass throttle for user-initiated actions (flush, clear, etc.)
    const subs = listeners.get(sessionId)
    if (!subs) return
    for (const listener of subs) {
        listener()
    }
}

function setState(sessionId: string, next: InternalState, immediate?: boolean): void {
    states.set(sessionId, next)
    if (immediate) {
        notifyImmediate(sessionId)
    } else {
        notify(sessionId)
    }
}

function updateState(sessionId: string, updater: (prev: InternalState) => InternalState, immediate?: boolean): void {
    const prev = getState(sessionId)
    const next = updater(prev)
    if (next !== prev) {
        setState(sessionId, next, immediate)
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

function resolveStreamAfterMessages(
    stream: SessionStreamState | null,
    messages: DecryptedMessage[]
): SessionStreamState | null {
    if (!stream) {
        return null
    }

    for (const message of messages) {
        if (extractCodexMessageItemId(message.content) === stream.streamId) {
            return null
        }
    }

    return stream
}

function buildState(
    prev: InternalState,
    updates: {
        messages?: DecryptedMessage[]
        pending?: DecryptedMessage[]
        pendingOverflowCount?: number
        pendingVisibleCount?: number
        pendingOverflowVisibleCount?: number
        hasLoadedLatest?: boolean
        hasMore?: boolean
        isLoading?: boolean
        isLoadingMore?: boolean
        warning?: string | null
        atBottom?: boolean
        historyExpanded?: boolean
        stream?: SessionStreamState | null
    }
): InternalState {
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
        stream,
        streamVersion,
        historyExpanded: updates.historyExpanded !== undefined ? updates.historyExpanded : prev.historyExpanded,
    }
}

function applyVisibleWindow(
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

function batchContainsHistoryJumpTarget(messages: readonly DecryptedMessage[]): boolean {
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

function filterPendingAgainstVisible(pending: DecryptedMessage[], visible: DecryptedMessage[]): DecryptedMessage[] {
    if (pending.length === 0 || visible.length === 0) {
        return pending
    }
    const visibleIds = new Set(visible.map((message) => message.id))
    return pending.filter((message) => !visibleIds.has(message.id))
}

function isOptimisticMessage(message: DecryptedMessage): boolean {
    return Boolean(message.localId && message.id === message.localId)
}

function mergeIntoPending(
    prev: InternalState,
    incoming: DecryptedMessage[]
): {
    pending: DecryptedMessage[]
    pendingVisibleCount: number
    pendingOverflowCount: number
    pendingOverflowVisibleCount: number
    warning: string | null
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
    const warning = droppedVisible > 0 && !prev.warning ? PENDING_OVERFLOW_WARNING : prev.warning
    return { pending, pendingVisibleCount, pendingOverflowCount, pendingOverflowVisibleCount, warning }
}

export function getMessageWindowState(sessionId: string): MessageWindowState {
    return getState(sessionId)
}

export function subscribeMessageWindow(sessionId: string, listener: () => void): () => void {
    const subs = listeners.get(sessionId) ?? new Set()
    subs.add(listener)
    listeners.set(sessionId, subs)
    return () => {
        const current = listeners.get(sessionId)
        if (!current) return
        current.delete(listener)
        if (current.size === 0) {
            listeners.delete(sessionId)
            states.delete(sessionId)
            clearPendingVisibilityCache(sessionId)
        }
    }
}

export function clearMessageWindow(sessionId: string): void {
    clearPendingVisibilityCache(sessionId)
    if (!states.has(sessionId)) {
        return
    }
    setState(sessionId, createState(sessionId), true)
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
        pendingOverflowVisibleCount: source.pendingOverflowVisibleCount,
        hasLoadedLatest: source.hasLoadedLatest,
        historyExpanded: source.historyExpanded,
        hasMore: source.hasMore,
        warning: source.warning,
        atBottom: source.atBottom,
        isLoading: false,
        isLoadingMore: false,
    })
    setState(toSessionId, next)
}

export async function ensureLatestMessagesLoaded(api: ApiClient, sessionId: string): Promise<void> {
    const current = getState(sessionId)
    if (current.hasLoadedLatest || current.isLoading) {
        return
    }

    await fetchLatestMessages(api, sessionId)
}

export async function fetchLatestMessages(api: ApiClient, sessionId: string): Promise<void> {
    const initial = getState(sessionId)
    if (initial.isLoading) {
        return
    }
    updateState(sessionId, (prev) => buildState(prev, { isLoading: true, warning: null }))

    try {
        const response = await api.getMessages(sessionId, { limit: PAGE_SIZE, beforeSeq: null })
        updateState(sessionId, (prev) => {
            const nextStream = resolveStreamAfterMessages(prev.stream, response.messages)
            if (prev.atBottom) {
                const merged = mergeMessages(prev.messages, [...prev.pending, ...response.messages])
                const visible = applyVisibleWindow(prev, merged, 'append')
                return buildState(prev, {
                    messages: visible,
                    pending: [],
                    pendingOverflowCount: 0,
                    pendingVisibleCount: 0,
                    pendingOverflowVisibleCount: 0,
                    hasLoadedLatest: true,
                    hasMore: response.page.hasMore,
                    isLoading: false,
                    warning: null,
                    stream: nextStream,
                })
            }
            const pendingResult = mergeIntoPending(prev, response.messages)
            return buildState(prev, {
                pending: pendingResult.pending,
                pendingVisibleCount: pendingResult.pendingVisibleCount,
                pendingOverflowCount: pendingResult.pendingOverflowCount,
                pendingOverflowVisibleCount: pendingResult.pendingOverflowVisibleCount,
                hasLoadedLatest: true,
                isLoading: false,
                warning: pendingResult.warning,
                stream: nextStream,
            })
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load messages'
        updateState(sessionId, (prev) => buildState(prev, {
            hasLoadedLatest: true,
            isLoading: false,
            warning: message
        }))
    }
}

async function loadMessagesAfter(api: ApiClient, sessionId: string, afterSeq: number): Promise<DecryptedMessage[]> {
    let cursor = afterSeq
    const collected: DecryptedMessage[] = []

    while (true) {
        const response = await api.getMessages(sessionId, {
            afterSeq: cursor,
            limit: CATCHUP_PAGE_SIZE
        })
        const messages = response.messages
        if (messages.length === 0) {
            return collected
        }

        collected.push(...messages)

        const nextCursor = findNextRecoveryCursor(messages, cursor)
        if (nextCursor <= cursor) {
            return collected
        }

        cursor = nextCursor
        if (messages.length < CATCHUP_PAGE_SIZE) {
            return collected
        }
    }
}

export async function catchupMessagesAfter(api: ApiClient, sessionId: string, afterSeq: number): Promise<void> {
    const messages = await loadMessagesAfter(api, sessionId, afterSeq)
    if (messages.length === 0) {
        return
    }
    ingestIncomingMessages(sessionId, messages)
}

export async function fetchOlderMessages(api: ApiClient, sessionId: string): Promise<LoadMoreMessagesResult> {
    const initial = getState(sessionId)
    const oldestSeq = initial.oldestSeq
    if (initial.isLoadingMore || !initial.hasMore) {
        return DID_NOT_LOAD_OLDER_MESSAGES_RESULT
    }
    if (oldestSeq === null) {
        return DID_NOT_LOAD_OLDER_MESSAGES_RESULT
    }
    updateState(sessionId, (prev) => buildState(prev, { isLoadingMore: true }))

    try {
        const response = await api.getMessages(sessionId, { limit: PAGE_SIZE, beforeSeq: oldestSeq })
        const didLoadOlderMessages = response.messages.some((message) => {
            return typeof message.seq === 'number' && message.seq < oldestSeq
        })

        updateState(sessionId, (prev) => {
            const merged = mergeMessages(response.messages, prev.messages)
            return buildState(prev, {
                messages: didLoadOlderMessages ? merged : prev.messages,
                hasMore: response.page.hasMore,
                isLoadingMore: false,
                historyExpanded: prev.historyExpanded || didLoadOlderMessages,
            })
        })
        return { didLoadOlderMessages }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load messages'
        updateState(sessionId, (prev) => buildState(prev, { isLoadingMore: false, warning: message }))
        return DID_NOT_LOAD_OLDER_MESSAGES_RESULT
    }
}

export async function fetchOlderMessagesUntilPreviousUser(
    api: ApiClient,
    sessionId: string
): Promise<LoadMoreMessagesResult> {
    const initial = getState(sessionId)
    const initialOldestSeq = initial.oldestSeq
    if (initial.isLoadingMore || !initial.hasMore) {
        return DID_NOT_LOAD_OLDER_MESSAGES_RESULT
    }
    if (initialOldestSeq === null) {
        return DID_NOT_LOAD_OLDER_MESSAGES_RESULT
    }

    updateState(sessionId, (prev) => buildState(prev, { isLoadingMore: true }))

    try {
        let beforeSeq: number | null = initialOldestSeq
        let hasMore: boolean = initial.hasMore
        let didLoadOlderMessages = false
        let accumulated: DecryptedMessage[] = []

        while (hasMore && beforeSeq !== null) {
            const response = await api.getMessages(sessionId, { limit: PAGE_SIZE, beforeSeq })
            const pageMessages = response.messages

            if (pageMessages.length === 0) {
                hasMore = response.page.hasMore
                beforeSeq = response.page.nextBeforeSeq
                continue
            }

            didLoadOlderMessages = didLoadOlderMessages || pageMessages.some((message) => {
                return typeof message.seq === 'number' && message.seq < initialOldestSeq
            })
            accumulated = mergeMessages(accumulated, pageMessages)
            hasMore = response.page.hasMore
            beforeSeq = response.page.nextBeforeSeq

            if (batchContainsHistoryJumpTarget(pageMessages)) {
                break
            }
        }

        updateState(sessionId, (prev) => {
            const merged = didLoadOlderMessages
                ? mergeMessages(accumulated, prev.messages)
                : prev.messages

            return buildState(prev, {
                messages: merged,
                hasMore,
                isLoadingMore: false,
                historyExpanded: prev.historyExpanded || didLoadOlderMessages,
            })
        })

        return { didLoadOlderMessages }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load messages'
        updateState(sessionId, (prev) => buildState(prev, { isLoadingMore: false, warning: message }))
        return DID_NOT_LOAD_OLDER_MESSAGES_RESULT
    }
}

export function applySessionStream(sessionId: string, stream: SessionStreamState): void {
    updateState(sessionId, (prev) => {
        if (
            prev.stream?.streamId === stream.streamId
            && prev.stream.text === stream.text
            && prev.stream.startedAt === stream.startedAt
            && prev.stream.updatedAt === stream.updatedAt
        ) {
            return prev
        }

        return buildState(prev, { stream })
    })
}

export function clearSessionStream(sessionId: string, streamId?: string): void {
    updateState(sessionId, (prev) => {
        if (!prev.stream) {
            return prev
        }
        if (streamId && prev.stream.streamId !== streamId) {
            return prev
        }

        return buildState(prev, { stream: null })
    })
}

export function ingestIncomingMessages(sessionId: string, incoming: DecryptedMessage[]): void {
    if (incoming.length === 0) {
        return
    }
    updateState(sessionId, (prev) => {
        const nextStream = resolveStreamAfterMessages(prev.stream, incoming)
        if (prev.atBottom) {
            const merged = mergeMessages(prev.messages, incoming)
            const visible = applyVisibleWindow(prev, merged, 'append')
            const pending = filterPendingAgainstVisible(prev.pending, visible)
            return buildState(prev, { messages: visible, pending, stream: nextStream })
        }
        // 不在底部时：agent 消息立即显示，user 消息才放入 pending
        // 原因：用户必须看到 AI 回复才能继续交互，pending 机制会导致回复滞后
        const agentMessages = incoming.filter(msg => !isUserMessage(msg))
        const userMessages = incoming.filter(msg => isUserMessage(msg))

        let state = prev
        if (agentMessages.length > 0) {
            const merged = mergeMessages(state.messages, agentMessages)
            const visible = applyVisibleWindow(state, merged, 'append')
            const pending = filterPendingAgainstVisible(state.pending, visible)
            state = buildState(state, { messages: visible, pending, stream: nextStream })
        }
        if (userMessages.length > 0) {
            const pendingResult = mergeIntoPending(state, userMessages)
            state = buildState(state, {
                pending: pendingResult.pending,
                pendingVisibleCount: pendingResult.pendingVisibleCount,
                pendingOverflowCount: pendingResult.pendingOverflowCount,
                pendingOverflowVisibleCount: pendingResult.pendingOverflowVisibleCount,
                warning: pendingResult.warning,
                stream: nextStream,
            })
        }
        if (userMessages.length === 0 && agentMessages.length === 0) {
            state = buildState(state, { stream: nextStream })
        }
        return state
    })
}

export function flushPendingMessages(sessionId: string): boolean {
    const current = getState(sessionId)
    if (current.pending.length === 0 && current.pendingOverflowVisibleCount === 0) {
        return false
    }
    const needsRefresh = current.pendingOverflowVisibleCount > 0
    updateState(sessionId, (prev) => {
        const merged = mergeMessages(prev.messages, prev.pending)
        const visible = applyVisibleWindow(prev, merged, 'append')
        return buildState(prev, {
            messages: visible,
            pending: [],
            pendingOverflowCount: 0,
            pendingVisibleCount: 0,
            pendingOverflowVisibleCount: 0,
            warning: needsRefresh ? (prev.warning ?? PENDING_OVERFLOW_WARNING) : prev.warning,
        })
    }, true)
    return needsRefresh
}

export function setAtBottom(sessionId: string, atBottom: boolean): void {
    updateState(sessionId, (prev) => {
        if (prev.atBottom === atBottom) {
            return prev
        }
        return buildState(prev, { atBottom })
    }, true)
}

export function appendOptimisticMessage(sessionId: string, message: DecryptedMessage): void {
    updateState(sessionId, (prev) => {
        const merged = mergeMessages(prev.messages, [message])
        const visible = applyVisibleWindow(prev, merged, 'append')
        const pending = filterPendingAgainstVisible(prev.pending, visible)
        return buildState(prev, { messages: visible, pending, atBottom: true })
    }, true)
}

export function updateMessageStatus(sessionId: string, localId: string, status: MessageStatus): void {
    if (!localId) {
        return
    }
    updateState(sessionId, (prev) => {
        let changed = false
        const updateList = (list: DecryptedMessage[]) => {
            return list.map((message) => {
                if (message.localId !== localId || !isOptimisticMessage(message)) {
                    return message
                }
                if (message.status === status) {
                    return message
                }
                changed = true
                return { ...message, status }
            })
        }
        const messages = updateList(prev.messages)
        const pending = updateList(prev.pending)
        if (!changed) {
            return prev
        }
        return buildState(prev, { messages, pending })
    })
}
