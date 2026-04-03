import {
    SESSION_RECOVERY_PAGE_SIZE,
    SESSION_TIMELINE_PAGE_SIZE
} from '@viby/protocol'
import type { ApiClient } from '@/api/client'
import type { DecryptedMessage } from '@/types/api'
import { MESSAGE_WINDOW_LOAD_FAILED_WARNING_KEY } from '@/lib/messageWindowWarnings'
import {
    loadMessagesAfter,
    loadOlderMessagesUntilPreviousUser
} from '@/lib/messageWindowPagination'
import {
    getInternalMessageWindowState,
    ingestIncomingMessages,
    updateMessageWindowState,
    type LoadMoreMessagesResult
} from '@/lib/messageWindowStoreCore'
import { buildState } from '@/lib/messageWindowState'
import {
    applyLatestMessagesError,
    applyLatestMessagesPage,
    applyLoadingMoreError,
    applyOlderMessagesPage,
    applyOlderMessagesUntilPreviousUserPage
} from '@/lib/messageWindowStoreReducers'

const PAGE_SIZE = SESSION_TIMELINE_PAGE_SIZE
const CATCHUP_PAGE_SIZE = SESSION_RECOVERY_PAGE_SIZE
const DID_NOT_LOAD_OLDER_MESSAGES_RESULT: LoadMoreMessagesResult = { didLoadOlderMessages: false }

export async function ensureLatestMessagesLoaded(api: ApiClient, sessionId: string): Promise<void> {
    const current = getInternalMessageWindowState(sessionId)
    if (current.isLoading) {
        return
    }
    if (current.hasLoadedLatest && !current.restoredFromWarmSnapshot) {
        return
    }

    await recoverLatestMessages(api, sessionId, {
        background: current.restoredFromWarmSnapshot
    })
}

export async function recoverLatestMessages(
    api: ApiClient,
    sessionId: string,
    options: Readonly<{ background?: boolean }> = {}
): Promise<void> {
    const current = getInternalMessageWindowState(sessionId)
    if (current.restoredFromWarmSnapshot && typeof current.newestSeq === 'number') {
        await recoverMessagesAfter(api, sessionId, current.newestSeq)
        return
    }

    await fetchLatestMessages(api, sessionId, options)
}

async function recoverMessagesAfter(api: ApiClient, sessionId: string, afterSeq: number): Promise<void> {
    let cursor = afterSeq

    while (true) {
        const recovery = await api.getSessionRecovery(sessionId, {
            afterSeq: cursor,
            limit: CATCHUP_PAGE_SIZE
        })

        updateMessageWindowState(sessionId, (prev) => {
            if (prev.hasLoadedLatest && prev.warning === null && !prev.restoredFromWarmSnapshot) {
                return prev
            }

            return buildState(prev, {
                hasLoadedLatest: true,
                warning: null,
                restoredFromWarmSnapshot: false
            })
        })

        if (recovery.messages.length === 0) {
            return
        }

        ingestIncomingMessages(sessionId, recovery.messages)
        const nextCursor = recovery.page.nextAfterSeq
        if (!recovery.page.hasMore || nextCursor <= cursor) {
            return
        }

        cursor = nextCursor
    }
}

export async function fetchLatestMessages(
    api: ApiClient,
    sessionId: string,
    options: Readonly<{ background?: boolean }> = {}
): Promise<void> {
    const initial = getInternalMessageWindowState(sessionId)
    if (initial.isLoading) {
        return
    }
    if (!options.background) {
        updateMessageWindowState(sessionId, (prev) => buildState(prev, {
            isLoading: true,
            warning: null
        }))
    }

    try {
        const response = await api.getMessages(sessionId, { limit: PAGE_SIZE, beforeSeq: null })
        updateMessageWindowState(sessionId, (prev) => {
            return applyLatestMessagesPage(prev, response.messages, response.page.hasMore)
        })
    } catch {
        updateMessageWindowState(sessionId, (prev) => {
            return applyLatestMessagesError(prev, MESSAGE_WINDOW_LOAD_FAILED_WARNING_KEY)
        })
    }
}

export async function catchupMessagesAfter(api: ApiClient, sessionId: string, afterSeq: number): Promise<void> {
    const messages = await loadMessagesAfter(api, sessionId, afterSeq, CATCHUP_PAGE_SIZE)
    if (messages.length === 0) {
        return
    }
    ingestIncomingMessages(sessionId, messages)
}

export async function fetchOlderMessages(api: ApiClient, sessionId: string): Promise<LoadMoreMessagesResult> {
    const initial = getInternalMessageWindowState(sessionId)
    const oldestSeq = initial.oldestSeq
    if (initial.isLoadingMore || !initial.hasMore) {
        return DID_NOT_LOAD_OLDER_MESSAGES_RESULT
    }
    if (oldestSeq === null) {
        return DID_NOT_LOAD_OLDER_MESSAGES_RESULT
    }

    updateMessageWindowState(sessionId, (prev) => buildState(prev, { isLoadingMore: true }))

    try {
        const response = await api.getMessages(sessionId, { limit: PAGE_SIZE, beforeSeq: oldestSeq })
        let didLoadOlderMessages = false
        updateMessageWindowState(sessionId, (prev) => {
            const result = applyOlderMessagesPage({
                prev,
                messages: response.messages,
                hasMore: response.page.hasMore,
                oldestSeq
            })
            didLoadOlderMessages = result.didLoadOlderMessages
            return result.state
        })
        return { didLoadOlderMessages }
    } catch {
        updateMessageWindowState(sessionId, (prev) => {
            return applyLoadingMoreError(prev, MESSAGE_WINDOW_LOAD_FAILED_WARNING_KEY)
        })
        return DID_NOT_LOAD_OLDER_MESSAGES_RESULT
    }
}

export async function fetchOlderMessagesUntilPreviousUser(
    api: ApiClient,
    sessionId: string
): Promise<LoadMoreMessagesResult> {
    const initial = getInternalMessageWindowState(sessionId)
    const initialOldestSeq = initial.oldestSeq
    if (initial.isLoadingMore || !initial.hasMore) {
        return DID_NOT_LOAD_OLDER_MESSAGES_RESULT
    }
    if (initialOldestSeq === null) {
        return DID_NOT_LOAD_OLDER_MESSAGES_RESULT
    }

    updateMessageWindowState(sessionId, (prev) => buildState(prev, { isLoadingMore: true }))

    try {
        const result = await loadOlderMessagesUntilPreviousUser({
            api,
            sessionId,
            initialOldestSeq,
            initialHasMore: initial.hasMore,
            pageSize: PAGE_SIZE
        })
        updateMessageWindowState(sessionId, (prev) => {
            return applyOlderMessagesUntilPreviousUserPage({
                prev,
                accumulated: result.accumulated,
                hasMore: result.hasMore,
                didLoadOlderMessages: result.didLoadOlderMessages
            })
        })

        return { didLoadOlderMessages: result.didLoadOlderMessages }
    } catch {
        updateMessageWindowState(sessionId, (prev) => {
            return applyLoadingMoreError(prev, MESSAGE_WINDOW_LOAD_FAILED_WARNING_KEY)
        })
        return DID_NOT_LOAD_OLDER_MESSAGES_RESULT
    }
}
