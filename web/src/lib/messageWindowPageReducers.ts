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
import type { ClientMessage } from '@/types/api'

function partitionUserMessages(messages: ClientMessage[]): {
    otherMessages: ClientMessage[]
    userMessages: ClientMessage[]
} {
    const userMessages: ClientMessage[] = []
    const otherMessages: ClientMessage[] = []
    for (const message of messages) {
        if (isUserMessage(message)) userMessages.push(message)
        else otherMessages.push(message)
    }
    return { otherMessages, userMessages }
}

export function applyLatestMessagesPage(
    prev: InternalState,
    messages: ClientMessage[],
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

    const { otherMessages, userMessages } = partitionUserMessages(messages)
    const visible =
        userMessages.length > 0
            ? applyVisibleWindow(prev, mergeMessages(prev.messages, userMessages), 'append')
            : prev.messages
    const pendingResult = mergeIntoPending(buildState(prev, { messages: visible }), otherMessages)
    return buildState(prev, {
        messages: visible,
        pending: pendingResult.pending,
        pendingVisibleCount: pendingResult.pendingVisibleCount,
        pendingOverflowCount: pendingResult.pendingOverflowCount,
        pendingOverflowVisibleCount: pendingResult.pendingOverflowVisibleCount,
        hasLoadedLatest: true,
        hasMore,
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
    messages: ClientMessage[]
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
    accumulated: ClientMessage[]
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

export function applyIncomingMessages(prev: InternalState, incoming: ClientMessage[]): InternalState {
    const nextStream = resolveStreamAfterMessages(prev.stream, incoming)
    const nextPendingReply = resolvePendingReplyAfterMessages(prev.pendingReply, incoming)
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
