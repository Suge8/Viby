import { isUserMessage, mergeMessages } from '@/lib/messages'
import {
    applyVisibleWindow,
    buildState,
    filterPendingAgainstVisible,
    type InternalState,
    mergeIntoPending,
    resolvePendingReplyAfterMessages,
    resolveStreamAfterMessages,
} from '@/lib/messageWindowState'
import type { MessageWindowWarningKey } from '@/lib/messageWindowWarnings'
import type { DecryptedMessage } from '@/types/api'

export function applyLatestMessagesPage(
    prev: InternalState,
    messages: DecryptedMessage[],
    hasMore: boolean
): InternalState {
    const nextStream = resolveStreamAfterMessages(prev.stream, messages)
    const nextPendingReply = resolvePendingReplyAfterMessages(prev.pendingReply, messages)

    if (prev.atBottom) {
        const merged = mergeMessages(prev.messages, [...prev.pending, ...messages])
        const visible = applyVisibleWindow(prev, merged, 'append')
        return buildState(prev, {
            messages: visible,
            pending: [],
            pendingOverflowCount: 0,
            pendingVisibleCount: 0,
            pendingOverflowVisibleCount: 0,
            hasLoadedLatest: true,
            hasMore,
            isLoading: false,
            warning: null,
            pendingReply: nextPendingReply,
            stream: nextStream,
            restoredFromWarmSnapshot: false,
        })
    }

    const pendingResult = mergeIntoPending(prev, messages)
    return buildState(prev, {
        pending: pendingResult.pending,
        pendingVisibleCount: pendingResult.pendingVisibleCount,
        pendingOverflowCount: pendingResult.pendingOverflowCount,
        pendingOverflowVisibleCount: pendingResult.pendingOverflowVisibleCount,
        hasLoadedLatest: true,
        isLoading: false,
        warning: pendingResult.warning,
        pendingReply: nextPendingReply,
        stream: nextStream,
        restoredFromWarmSnapshot: false,
    })
}

export function applyLatestMessagesError(prev: InternalState, warning: MessageWindowWarningKey): InternalState {
    return buildState(prev, {
        hasLoadedLatest: true,
        isLoading: false,
        warning,
        restoredFromWarmSnapshot: false,
    })
}

export function applyOlderMessagesPage(options: {
    prev: InternalState
    messages: DecryptedMessage[]
    hasMore: boolean
    oldestSeq: number
}): {
    state: InternalState
    didLoadOlderMessages: boolean
} {
    const didLoadOlderMessages = options.messages.some((message) => {
        return typeof message.seq === 'number' && message.seq < options.oldestSeq
    })

    const merged = mergeMessages(options.messages, options.prev.messages)
    return {
        didLoadOlderMessages,
        state: buildState(options.prev, {
            messages: didLoadOlderMessages ? merged : options.prev.messages,
            hasMore: options.hasMore,
            isLoadingMore: false,
            historyExpanded: options.prev.historyExpanded || didLoadOlderMessages,
        }),
    }
}

export function applyOlderMessagesUntilPreviousUserPage(options: {
    prev: InternalState
    accumulated: DecryptedMessage[]
    hasMore: boolean
    didLoadOlderMessages: boolean
}): InternalState {
    const merged = options.didLoadOlderMessages
        ? mergeMessages(options.accumulated, options.prev.messages)
        : options.prev.messages

    return buildState(options.prev, {
        messages: merged,
        hasMore: options.hasMore,
        isLoadingMore: false,
        historyExpanded: options.prev.historyExpanded || options.didLoadOlderMessages,
    })
}

export function applyLoadingMoreError(prev: InternalState, warning: MessageWindowWarningKey): InternalState {
    return buildState(prev, { isLoadingMore: false, warning })
}

export function applyIncomingMessages(prev: InternalState, incoming: DecryptedMessage[]): InternalState {
    const nextStream = resolveStreamAfterMessages(prev.stream, incoming)
    const nextPendingReply = resolvePendingReplyAfterMessages(prev.pendingReply, incoming)

    if (prev.atBottom) {
        const merged = mergeMessages(prev.messages, incoming)
        const visible = applyVisibleWindow(prev, merged, 'append')
        const pending = filterPendingAgainstVisible(prev.pending, visible)
        return buildState(prev, {
            messages: visible,
            pending,
            pendingReply: nextPendingReply,
            stream: nextStream,
        })
    }

    const agentMessages = incoming.filter((message) => !isUserMessage(message))
    const userMessages = incoming.filter((message) => isUserMessage(message))
    let state = prev

    if (agentMessages.length > 0) {
        const merged = mergeMessages(state.messages, agentMessages)
        const visible = applyVisibleWindow(state, merged, 'append')
        const pending = filterPendingAgainstVisible(state.pending, visible)
        state = buildState(state, {
            messages: visible,
            pending,
            pendingReply: nextPendingReply,
            stream: nextStream,
        })
    }

    if (userMessages.length > 0) {
        const pendingResult = mergeIntoPending(state, userMessages)
        state = buildState(state, {
            pending: pendingResult.pending,
            pendingVisibleCount: pendingResult.pendingVisibleCount,
            pendingOverflowCount: pendingResult.pendingOverflowCount,
            pendingOverflowVisibleCount: pendingResult.pendingOverflowVisibleCount,
            warning: pendingResult.warning,
            pendingReply: nextPendingReply,
            stream: nextStream,
        })
    }

    if (userMessages.length === 0 && agentMessages.length === 0) {
        state = buildState(state, {
            pendingReply: nextPendingReply,
            stream: nextStream,
        })
    }

    return state
}

export function applyFlushedPendingMessages(
    prev: InternalState,
    overflowWarning: MessageWindowWarningKey
): {
    needsRefresh: boolean
    state: InternalState
} {
    const needsRefresh = prev.pendingOverflowVisibleCount > 0
    const merged = mergeMessages(prev.messages, prev.pending)
    const visible = applyVisibleWindow(prev, merged, 'append')

    return {
        needsRefresh,
        state: buildState(prev, {
            messages: visible,
            pending: [],
            pendingOverflowCount: 0,
            pendingVisibleCount: 0,
            pendingOverflowVisibleCount: 0,
            warning: needsRefresh ? (prev.warning ?? overflowWarning) : prev.warning,
        }),
    }
}
