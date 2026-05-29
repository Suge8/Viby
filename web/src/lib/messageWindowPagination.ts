import { findNextRecoveryCursor } from '@viby/protocol'
import type { ApiClient } from '@/api/client'
import { mergeMessages } from '@/lib/messages'
import { batchContainsHistoryJumpTarget } from '@/lib/messageWindowState'
import type { ClientMessage } from '@/types/api'

export async function loadMessagesAfter(
    api: ApiClient,
    sessionId: string,
    afterSeq: number,
    pageSize: number
): Promise<ClientMessage[]> {
    let cursor = afterSeq
    const collected: ClientMessage[] = []

    while (true) {
        const response = await api.getMessages(sessionId, {
            afterSeq: cursor,
            limit: pageSize,
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
        if (messages.length < pageSize) {
            return collected
        }
    }
}

export async function loadOlderMessagesUntilPreviousUser(options: {
    api: ApiClient
    sessionId: string
    initialOldestSeq: number
    initialHasMore: boolean
    pageSize: number
}): Promise<{
    accumulated: ClientMessage[]
    didLoadOlderMessages: boolean
    hasMore: boolean
}> {
    let beforeSeq: number | null = options.initialOldestSeq
    let hasMore = options.initialHasMore
    let didLoadOlderMessages = false
    let accumulated: ClientMessage[] = []

    while (hasMore && beforeSeq !== null) {
        const response = await options.api.getMessages(options.sessionId, {
            limit: options.pageSize,
            beforeSeq,
        })
        const pageMessages = response.messages

        if (pageMessages.length === 0) {
            hasMore = response.page.hasMore
            beforeSeq = response.page.nextBeforeSeq
            continue
        }

        didLoadOlderMessages =
            didLoadOlderMessages ||
            pageMessages.some((message) => {
                return typeof message.seq === 'number' && message.seq < options.initialOldestSeq
            })
        accumulated = mergeMessages(pageMessages, accumulated)
        hasMore = response.page.hasMore
        beforeSeq = response.page.nextBeforeSeq

        if (batchContainsHistoryJumpTarget(pageMessages)) {
            break
        }
    }

    return {
        accumulated,
        didLoadOlderMessages,
        hasMore,
    }
}
