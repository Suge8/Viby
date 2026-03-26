import type { DecryptedMessage, MessageStatus, SessionStreamState } from '@/types/api'
import { isUserMessage, mergeMessages } from '@/lib/messages'
import type { MessageWindowWarningKey } from '@/lib/messageWindowWarnings'
import {
    applyVisibleWindow,
    buildState,
    createPendingReplyState,
    filterPendingAgainstVisible,
    isOptimisticMessage,
    mergeIntoPending,
    resolvePendingReplyAfterMessages,
    resolveStreamAfterMessages,
    type InternalState
} from '@/lib/messageWindowState'

export function applyLatestMessagesPage(prev: InternalState, messages: DecryptedMessage[], hasMore: boolean): InternalState {
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
        restoredFromWarmSnapshot: false
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
        })
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

export function applySessionStreamUpdate(prev: InternalState, stream: SessionStreamState): InternalState {
    if (
        prev.stream?.streamId === stream.streamId
        && prev.stream.text === stream.text
        && prev.stream.startedAt === stream.startedAt
        && prev.stream.updatedAt === stream.updatedAt
    ) {
        return prev
    }

    return buildState(prev, {
        pendingReply: stream.text.length > 0 ? null : prev.pendingReply,
        stream
    })
}

export function applyClearedSessionStream(prev: InternalState, streamId?: string): InternalState {
    if (!prev.stream) {
        return prev
    }
    if (streamId && prev.stream.streamId !== streamId) {
        return prev
    }

    return buildState(prev, { stream: null })
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
            stream: nextStream
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
            stream: nextStream
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
            stream: nextStream
        })
    }

    return state
}

export function applyFlushedPendingMessages(prev: InternalState, overflowWarning: MessageWindowWarningKey): {
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
        })
    }
}

export function applyAppendedOptimisticMessage(prev: InternalState, message: DecryptedMessage): InternalState {
    const merged = mergeMessages(prev.messages, [message])
    const visible = applyVisibleWindow(prev, merged, 'append')
    const pending = filterPendingAgainstVisible(prev.pending, visible)
    const nextPendingReply = message.localId
        ? createPendingReplyState({
            localId: message.localId,
            requestStartedAt: message.createdAt,
            phase: 'sending'
        })
        : prev.pendingReply

    return buildState(prev, {
        messages: visible,
        pending,
        atBottom: true,
        pendingReply: nextPendingReply
    })
}

export function applyPendingReplyAccepted(prev: InternalState, localId: string, acceptedAt: number): InternalState {
    if (!prev.pendingReply || prev.pendingReply.localId !== localId) {
        return prev
    }
    if (
        prev.pendingReply.phase === 'preparing'
        && prev.pendingReply.serverAcceptedAt === acceptedAt
    ) {
        return prev
    }

    return buildState(prev, {
        pendingReply: createPendingReplyState({
            localId,
            requestStartedAt: prev.pendingReply.requestStartedAt,
            serverAcceptedAt: acceptedAt,
            phase: 'preparing'
        })
    })
}

export function applyClearedPendingReply(prev: InternalState, localId?: string): InternalState {
    if (!prev.pendingReply) {
        return prev
    }
    if (localId && prev.pendingReply.localId !== localId) {
        return prev
    }

    return buildState(prev, { pendingReply: null })
}

export function applyMessageStatusUpdate(
    prev: InternalState,
    localId: string,
    status: MessageStatus
): InternalState {
    let changed = false

    function updateList(list: DecryptedMessage[]): DecryptedMessage[] {
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

    let nextPendingReply = prev.pendingReply
    if (status === 'failed' && prev.pendingReply?.localId === localId) {
        nextPendingReply = null
    }

    if (status === 'sending') {
        const retryingMessage = [...messages, ...pending].find((message) => {
            return message.localId === localId && isOptimisticMessage(message)
        })
        if (retryingMessage?.localId) {
            nextPendingReply = createPendingReplyState({
                localId: retryingMessage.localId,
                requestStartedAt: retryingMessage.createdAt,
                phase: 'sending'
            })
        }
    }

    return buildState(prev, { messages, pending, pendingReply: nextPendingReply })
}
