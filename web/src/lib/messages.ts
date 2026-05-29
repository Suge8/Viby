import type { InfiniteData } from '@tanstack/react-query'
import { createScopedId } from '@/lib/id'
import type { ClientMessage, MessagesResponse } from '@/types/api'

export function makeClientSideId(prefix: string): string {
    return createScopedId(prefix)
}

export function isUserMessage(msg: ClientMessage): boolean {
    const content = msg.content
    if (content && typeof content === 'object' && 'role' in content) {
        return (content as { role: string }).role === 'user'
    }
    return false
}

function isOptimisticMessage(msg: ClientMessage): boolean {
    return Boolean(msg.localId && msg.id === msg.localId)
}

export function isQueuedForInvocation(msg: ClientMessage): boolean {
    return isUserMessage(msg) && msg.invokedAt === null && msg.status !== 'failed'
}

function compareMessages(a: ClientMessage, b: ClientMessage): number {
    const aSeq = typeof a.seq === 'number' ? a.seq : null
    const bSeq = typeof b.seq === 'number' ? b.seq : null

    if (aSeq !== null && bSeq !== null && aSeq !== bSeq) {
        return aSeq - bSeq
    }

    const aPosition = a.invokedAt ?? a.createdAt
    const bPosition = b.invokedAt ?? b.createdAt
    if (aPosition !== bPosition) {
        return aPosition - bPosition
    }
    return a.id.localeCompare(b.id)
}

function hasOwnInvokedAt(message: ClientMessage): boolean {
    return Object.prototype.hasOwnProperty.call(message, 'invokedAt')
}

function mergeIncomingMessage(
    message: ClientMessage,
    optimisticByLocalId: ReadonlyMap<string, ClientMessage>
): ClientMessage {
    if (!message.localId || isOptimisticMessage(message)) {
        return message
    }

    const optimistic = optimisticByLocalId.get(message.localId)
    if (!optimistic) {
        return message
    }

    return {
        ...message,
        status: message.status ?? (message.invokedAt === null ? 'queued' : 'sent'),
        originalText: message.originalText ?? optimistic.originalText,
        invokedAt: hasOwnInvokedAt(message) ? message.invokedAt : optimistic.invokedAt,
    }
}

export function mergeMessages(existing: ClientMessage[], incoming: ClientMessage[]): ClientMessage[] {
    if (existing.length === 0) {
        return [...incoming].sort(compareMessages)
    }
    if (incoming.length === 0) {
        return [...existing].sort(compareMessages)
    }

    const byId = new Map<string, ClientMessage>()
    const optimisticByLocalId = new Map<string, ClientMessage>()
    for (const msg of existing) {
        byId.set(msg.id, msg)
        if (msg.localId && isOptimisticMessage(msg)) {
            optimisticByLocalId.set(msg.localId, msg)
        }
    }
    for (const msg of incoming) {
        byId.set(msg.id, mergeIncomingMessage(msg, optimisticByLocalId))
    }

    let merged = Array.from(byId.values())

    const incomingStoredLocalIds = new Set<string>()
    for (const msg of incoming) {
        if (msg.localId && !isOptimisticMessage(msg)) {
            incomingStoredLocalIds.add(msg.localId)
        }
    }

    // If we received stored messages with a localId, drop any optimistic bubbles with the same localId.
    if (incomingStoredLocalIds.size > 0) {
        merged = merged.filter((msg) => {
            if (!msg.localId || !incomingStoredLocalIds.has(msg.localId)) {
                return true
            }
            return !isOptimisticMessage(msg)
        })
    }

    // Fallback: if an optimistic message was marked as sent but we didn't get a localId echo,
    // drop it when a server user message appears close in time.
    const optimisticMessages = merged.filter((m) => isOptimisticMessage(m))
    const nonOptimisticMessages = merged.filter((m) => !isOptimisticMessage(m))
    const result: ClientMessage[] = [...nonOptimisticMessages]

    for (const optimistic of optimisticMessages) {
        if (optimistic.status === 'sent') {
            const hasServerUserMessage = nonOptimisticMessages.some(
                (m) => isUserMessage(m) && Math.abs(m.createdAt - optimistic.createdAt) < 10_000
            )
            if (hasServerUserMessage) {
                continue
            }
        }
        result.push(optimistic)
    }

    result.sort(compareMessages)
    return result
}

export function upsertMessagesInCache(
    data: InfiniteData<MessagesResponse> | undefined,
    incoming: ClientMessage[]
): InfiniteData<MessagesResponse> {
    const mergedIncoming = mergeMessages([], incoming)

    if (!data || data.pages.length === 0) {
        return {
            pages: [
                {
                    messages: mergedIncoming,
                    page: {
                        limit: 50,
                        beforeSeq: null,
                        nextBeforeSeq: null,
                        hasMore: false,
                    },
                },
            ],
            pageParams: [null],
        }
    }

    const pages = data.pages.slice()
    const first = pages[0]
    pages[0] = {
        ...first,
        messages: mergeMessages(first.messages, mergedIncoming),
    }

    return {
        ...data,
        pages,
    }
}
