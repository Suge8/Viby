import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { ApiClient } from '@/api/client'
import type { DecryptedMessage, SessionStreamState } from '@/types/api'
import type { MessageWindowWarningKey } from '@/lib/messageWindowWarnings'
import {
    clearMessageWindow,
    flushMessageWindowSnapshot,
    flushPendingMessages,
    getMessageWindowState,
    type PendingReplyState,
    setAtBottom as setMessageWindowAtBottom,
    subscribeMessageWindow,
    type LoadMoreMessagesResult,
    type MessageWindowState,
} from '@/lib/messageWindowStoreCore'
import { loadMessageWindowStoreAsyncModule } from '@/lib/messageWindowStoreModule'

const EMPTY_STATE: MessageWindowState = {
    sessionId: 'unknown',
    messages: [],
    pending: [],
    pendingCount: 0,
    hasLoadedLatest: false,
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
}
const DID_NOT_LOAD_OLDER_MESSAGES_RESULT: LoadMoreMessagesResult = { didLoadOlderMessages: false }

export function useMessages(api: ApiClient | null, sessionId: string | null): {
    messages: DecryptedMessage[]
    warning: MessageWindowWarningKey | null
    isLoading: boolean
    isLoadingMore: boolean
    hasMore: boolean
    pendingCount: number
    hasLoadedLatest: boolean
    messagesVersion: number
    pendingReply: PendingReplyState | null
    stream: SessionStreamState | null
    streamVersion: number
    loadMore: () => Promise<LoadMoreMessagesResult>
    loadHistoryUntilPreviousUser: () => Promise<LoadMoreMessagesResult>
    refetch: () => Promise<unknown>
    flushPending: () => Promise<void>
    setAtBottom: (atBottom: boolean) => void
} {
    const state = useSyncExternalStore(
        useCallback((listener) => {
            if (!sessionId) {
                return () => {}
            }
            return subscribeMessageWindow(sessionId, listener)
        }, [sessionId]),
        useCallback(() => {
            if (!sessionId) {
                return EMPTY_STATE
            }
            return getMessageWindowState(sessionId)
        }, [sessionId]),
        () => EMPTY_STATE
    )

    useEffect(() => {
        if (!api || !sessionId) {
            return
        }

        void loadMessageWindowStoreAsyncModule().then(({ ensureLatestMessagesLoaded }) => {
            return ensureLatestMessagesLoaded(api, sessionId)
        })
    }, [api, sessionId])

    useEffect(() => {
        if (!sessionId) {
            return
        }
        return () => {
            flushMessageWindowSnapshot(sessionId)
            clearMessageWindow(sessionId)
        }
    }, [sessionId])

    const loadMore = useCallback(async () => {
        if (!api || !sessionId) {
            return DID_NOT_LOAD_OLDER_MESSAGES_RESULT
        }
        if (!state.hasMore || state.isLoadingMore) {
            return DID_NOT_LOAD_OLDER_MESSAGES_RESULT
        }
        const { fetchOlderMessages } = await loadMessageWindowStoreAsyncModule()
        return await fetchOlderMessages(api, sessionId)
    }, [api, sessionId, state.hasMore, state.isLoadingMore])

    const loadHistoryUntilPreviousUser = useCallback(async () => {
        if (!api || !sessionId) {
            return DID_NOT_LOAD_OLDER_MESSAGES_RESULT
        }
        if (!state.hasMore || state.isLoadingMore) {
            return DID_NOT_LOAD_OLDER_MESSAGES_RESULT
        }
        const { fetchOlderMessagesUntilPreviousUser } = await loadMessageWindowStoreAsyncModule()
        return await fetchOlderMessagesUntilPreviousUser(api, sessionId)
    }, [api, sessionId, state.hasMore, state.isLoadingMore])

    const refetch = useCallback(async () => {
        if (!api || !sessionId) return
        const { fetchLatestMessages } = await loadMessageWindowStoreAsyncModule()
        await fetchLatestMessages(api, sessionId)
    }, [api, sessionId])

    const flushPending = useCallback(async () => {
        if (!sessionId) return
        const needsRefresh = flushPendingMessages(sessionId)
        if (needsRefresh && api) {
            const { fetchLatestMessages } = await loadMessageWindowStoreAsyncModule()
            await fetchLatestMessages(api, sessionId)
        }
    }, [api, sessionId])

    const setAtBottom = useCallback((atBottom: boolean) => {
        if (!sessionId) return
        setMessageWindowAtBottom(sessionId, atBottom)
    }, [sessionId])

    return {
        messages: state.messages,
        warning: state.warning,
        isLoading: state.isLoading,
        isLoadingMore: state.isLoadingMore,
        hasMore: state.hasMore,
        pendingCount: state.pendingCount,
        hasLoadedLatest: state.hasLoadedLatest,
        messagesVersion: state.messagesVersion,
        pendingReply: state.pendingReply,
        stream: state.stream,
        streamVersion: state.streamVersion,
        loadMore,
        loadHistoryUntilPreviousUser,
        refetch,
        flushPending,
        setAtBottom,
    }
}
