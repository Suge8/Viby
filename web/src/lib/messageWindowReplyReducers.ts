import { isQueuedForInvocation, mergeMessages } from '@/lib/messages'
import {
    applyVisibleWindow,
    buildState,
    createPendingReplyState,
    filterPendingAgainstVisible,
    type InternalState,
    isOptimisticMessage,
    resolvePendingReplyAfterMessages,
    resolveStreamAfterMessages,
} from '@/lib/messageWindowState'
import type { DecryptedMessage, MessageStatus, SessionStreamState } from '@/types/api'

export function applySessionStreamUpdate(prev: InternalState, stream: SessionStreamState): InternalState {
    if (
        prev.stream?.assistantTurnId === stream.assistantTurnId &&
        prev.stream.text === stream.text &&
        prev.stream.startedAt === stream.startedAt &&
        prev.stream.updatedAt === stream.updatedAt
    ) {
        return prev
    }

    return buildState(prev, {
        pendingReply: stream.text.length > 0 ? null : prev.pendingReply,
        stream,
    })
}

export function applyClearedSessionStream(prev: InternalState, assistantTurnId?: string): InternalState {
    if (!prev.stream) {
        return prev
    }
    if (assistantTurnId && prev.stream.assistantTurnId !== assistantTurnId) {
        return prev
    }

    return buildState(prev, { stream: null })
}

export function applyAppendedOptimisticMessage(prev: InternalState, message: DecryptedMessage): InternalState {
    const merged = mergeMessages(prev.messages, [message])
    const visible = applyVisibleWindow(prev, merged, 'append')
    const pending = filterPendingAgainstVisible(prev.pending, visible)
    const nextPendingReply =
        message.localId && message.status !== 'queued'
            ? createPendingReplyState({
                  localId: message.localId,
                  requestStartedAt: message.createdAt,
                  phase: 'sending',
              })
            : prev.pendingReply

    return buildState(prev, {
        messages: visible,
        pending,
        pendingReply: nextPendingReply,
    })
}

export function applyMessagesConsumed(
    prev: InternalState,
    localIds: readonly string[],
    invokedAt: number
): InternalState {
    if (localIds.length === 0) {
        return prev
    }

    const consumedIds = new Set(localIds)
    let changed = false
    let firstConsumedMessage: DecryptedMessage | null = null

    function updateList(list: DecryptedMessage[]): DecryptedMessage[] {
        return list.map((message) => {
            if (!message.localId || !consumedIds.has(message.localId)) {
                return message
            }
            if (message.invokedAt === invokedAt && message.status === 'sent') {
                return message
            }

            changed = true
            const next = { ...message, invokedAt, status: 'sent' as const }
            firstConsumedMessage ??= next
            return next
        })
    }

    const messages = updateList(prev.messages)
    const pending = updateList(prev.pending)
    if (!changed) {
        return prev
    }

    let nextPendingReply = prev.pendingReply
    const consumedMessage = firstConsumedMessage as DecryptedMessage | null
    if (prev.pendingReply && consumedIds.has(prev.pendingReply.localId)) {
        nextPendingReply = createPendingReplyState({
            localId: prev.pendingReply.localId,
            requestStartedAt: prev.pendingReply.requestStartedAt,
            serverAcceptedAt: invokedAt,
            phase: 'preparing',
        })
    } else if (consumedMessage?.localId) {
        nextPendingReply = createPendingReplyState({
            localId: consumedMessage.localId,
            requestStartedAt: consumedMessage.createdAt,
            serverAcceptedAt: invokedAt,
            phase: 'preparing',
        })
    }

    return buildState(prev, { messages, pending, pendingReply: nextPendingReply })
}

export function applyQueuedMessagesCanceled(prev: InternalState, localIds: readonly string[]): InternalState {
    if (localIds.length === 0) {
        return prev
    }

    const canceledIds = new Set(localIds)
    let changed = false
    const keepMessage = (message: DecryptedMessage): boolean => {
        const keep = !message.localId || !canceledIds.has(message.localId) || !isQueuedForInvocation(message)
        changed ||= !keep
        return keep
    }
    const messages = prev.messages.filter(keepMessage)
    const pending = prev.pending.filter(keepMessage)
    const pendingReply = prev.pendingReply && canceledIds.has(prev.pendingReply.localId) ? null : prev.pendingReply

    if (!changed && pendingReply === prev.pendingReply) {
        return prev
    }

    return buildState(prev, { messages, pending, pendingReply })
}

export function applyPendingReplyAccepted(prev: InternalState, localId: string, acceptedAt: number): InternalState {
    if (!prev.pendingReply || prev.pendingReply.localId !== localId) {
        return prev
    }
    if (prev.pendingReply.phase === 'preparing' && prev.pendingReply.serverAcceptedAt === acceptedAt) {
        return prev
    }

    return buildState(prev, {
        pendingReply: createPendingReplyState({
            localId,
            requestStartedAt: prev.pendingReply.requestStartedAt,
            serverAcceptedAt: acceptedAt,
            phase: 'preparing',
        }),
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

export function applySessionReplyingState(
    prev: InternalState,
    replyingState: Readonly<{
        pendingReply: InternalState['pendingReply']
        stream: InternalState['stream']
    }>
): InternalState {
    if (prev.pendingReply === replyingState.pendingReply && prev.stream === replyingState.stream) {
        return prev
    }

    return buildState(prev, {
        pendingReply: replyingState.pendingReply,
        stream: replyingState.stream,
    })
}

export function applyMessageStatusUpdate(prev: InternalState, localId: string, status: MessageStatus): InternalState {
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
    if ((status === 'failed' || status === 'queued') && prev.pendingReply?.localId === localId) {
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
                phase: 'sending',
            })
        }
    }

    return buildState(prev, { messages, pending, pendingReply: nextPendingReply })
}
