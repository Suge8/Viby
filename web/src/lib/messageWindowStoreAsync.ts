import { SESSION_RECOVERY_PAGE_SIZE, SESSION_TIMELINE_PAGE_SIZE } from '@viby/protocol'
import type { ApiClient } from '@/api/client'
import { loadMessagesAfter, loadOlderMessagesUntilPreviousUser } from '@/lib/messageWindowPagination'
import { buildState } from '@/lib/messageWindowState'
import {
    getInternalMessageWindowState,
    ingestIncomingMessages,
    type LoadMoreMessagesResult,
    updateMessageWindowState,
} from '@/lib/messageWindowStoreCore'
import {
    applyClearedSessionStream,
    applyLatestMessagesError,
    applyLatestMessagesPage,
    applyLoadingMoreError,
    applyOlderMessagesPage,
    applyOlderMessagesUntilPreviousUserPage,
    applySessionStreamUpdate,
} from '@/lib/messageWindowStoreReducers'
import { MESSAGE_WINDOW_LOAD_FAILED_WARNING_KEY } from '@/lib/messageWindowWarnings'
import type { DecryptedMessage } from '@/types/api'

const PAGE_SIZE = SESSION_TIMELINE_PAGE_SIZE
const CATCHUP_PAGE_SIZE = SESSION_RECOVERY_PAGE_SIZE
const DID_NOT_LOAD_OLDER_MESSAGES_RESULT: LoadMoreMessagesResult = { didLoadOlderMessages: false }
const inFlightRecoveryBySessionId = new Map<string, Promise<void>>()
const inFlightLatestLoadBySessionId = new Map<string, Promise<void>>()

function runDedupedRecovery(sessionId: string, task: () => Promise<void>): Promise<void> {
    const current = inFlightRecoveryBySessionId.get(sessionId)
    if (current) {
        return current
    }

    const next = task().finally(() => {
        if (inFlightRecoveryBySessionId.get(sessionId) === next) {
            inFlightRecoveryBySessionId.delete(sessionId)
        }
    })
    inFlightRecoveryBySessionId.set(sessionId, next)
    return next
}

function runDedupedLatestLoad(sessionId: string, task: () => Promise<void>): Promise<void> {
    const current = inFlightLatestLoadBySessionId.get(sessionId)
    if (current) {
        return current
    }

    const next = task().finally(() => {
        if (inFlightLatestLoadBySessionId.get(sessionId) === next) {
            inFlightLatestLoadBySessionId.delete(sessionId)
        }
    })
    inFlightLatestLoadBySessionId.set(sessionId, next)
    return next
}

export async function ensureLatestMessagesLoaded(api: ApiClient, sessionId: string): Promise<void> {
    const current = getInternalMessageWindowState(sessionId)
    if (current.isLoading) {
        await inFlightLatestLoadBySessionId.get(sessionId)
        return
    }
    if (current.hasLoadedLatest && !current.restoredFromWarmSnapshot) {
        return
    }

    await recoverLatestMessages(api, sessionId, {
        background: current.restoredFromWarmSnapshot,
    })
}

export async function recoverLatestMessages(
    api: ApiClient,
    sessionId: string,
    options: Readonly<{ background?: boolean }> = {}
): Promise<void> {
    const current = getInternalMessageWindowState(sessionId)
    const newestSeq = current.newestSeq
    if (current.restoredFromWarmSnapshot && typeof newestSeq === 'number') {
        await runDedupedRecovery(sessionId, () => recoverMessagesAfter(api, sessionId, newestSeq))
        return
    }

    await fetchLatestMessages(api, sessionId, options)
}

async function recoverMessagesAfter(api: ApiClient, sessionId: string, afterSeq: number): Promise<void> {
    let cursor = afterSeq

    while (true) {
        const recovery = await api.getSessionRecovery(sessionId, {
            afterSeq: cursor,
            limit: CATCHUP_PAGE_SIZE,
        })

        updateMessageWindowState(sessionId, (prev) => {
            if (prev.hasLoadedLatest && prev.warning === null && !prev.restoredFromWarmSnapshot) {
                return prev
            }

            return buildState(prev, {
                hasLoadedLatest: true,
                warning: null,
                restoredFromWarmSnapshot: false,
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
    await runDedupedLatestLoad(sessionId, async () => {
        const initial = getInternalMessageWindowState(sessionId)
        if (!options.background && !initial.isLoading) {
            updateMessageWindowState(sessionId, (prev) =>
                buildState(prev, {
                    isLoading: true,
                    warning: null,
                })
            )
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
    })
}

export function hydrateLatestMessagesFromSessionView(options: {
    sessionId: string
    messages: DecryptedMessage[]
    hasMore: boolean
    stream: import('@/types/api').SessionStreamState | null
}): void {
    updateMessageWindowState(
        options.sessionId,
        (prev) => {
            const nextWithLatest = applyLatestMessagesPage(prev, options.messages, options.hasMore)
            return options.stream
                ? applySessionStreamUpdate(nextWithLatest, options.stream)
                : applyClearedSessionStream(nextWithLatest)
        },
        { immediate: true }
    )
}

export async function catchupMessagesAfter(api: ApiClient, sessionId: string, afterSeq: number): Promise<void> {
    const messages = await loadMessagesAfter(api, sessionId, afterSeq, CATCHUP_PAGE_SIZE)
    if (messages.length === 0) {
        return
    }
    ingestIncomingMessages(sessionId, messages)
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
            pageSize: PAGE_SIZE,
        })
        updateMessageWindowState(sessionId, (prev) => {
            return applyOlderMessagesUntilPreviousUserPage({
                prev,
                accumulated: result.accumulated,
                hasMore: result.hasMore,
                didLoadOlderMessages: result.didLoadOlderMessages,
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
