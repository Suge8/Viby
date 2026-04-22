import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { ApiClient } from '@/api/client'
import { readSessionViewRuntimeLoad } from '@/hooks/queries/sessionViewRuntime'
import {
    ensureLatestMessagesLoaded,
    fetchLatestMessages,
    fetchOlderMessagesUntilPreviousUser,
} from '@/lib/message-window-store'
import {
    flushMessageWindowSnapshot,
    flushPendingMessages,
    getMessageWindowState,
    type LoadMoreMessagesResult,
    type MessageWindowState,
    type PendingReplyState,
    setAtBottom as setMessageWindowAtBottom,
    subscribeMessageWindow,
} from '@/lib/messageWindowStoreCore'
import type { MessageWindowWarningKey } from '@/lib/messageWindowWarnings'
import type { DecryptedMessage, SessionStreamState } from '@/types/api'

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

async function ensureSessionLatestWindow(api: ApiClient, sessionId: string): Promise<void> {
    const pendingSessionViewLoad = readSessionViewRuntimeLoad(sessionId)
    if (pendingSessionViewLoad) {
        try {
            await pendingSessionViewLoad
        } catch {
            // Session detail fetch failure must not block the message-window owner.
        }
    }

    await ensureLatestMessagesLoaded(api, sessionId)
}

export function useMessages(
    api: ApiClient | null,
    sessionId: string | null
): {
    messages: DecryptedMessage[]
    warning: MessageWindowWarningKey | null
    isLoading: boolean
    isLoadingMore: boolean
    hasMore: boolean
    pendingCount: number
    atBottom: boolean
    hasLoadedLatest: boolean
    messagesVersion: number
    pendingReply: PendingReplyState | null
    stream: SessionStreamState | null
    streamVersion: number
    loadHistoryUntilPreviousUser: () => Promise<LoadMoreMessagesResult>
    flushPending: () => Promise<void>
    setAtBottom: (atBottom: boolean) => void
} {
    const state = useSyncExternalStore(
        useCallback(
            (listener) => {
                if (!sessionId) {
                    return () => {}
                }
                return subscribeMessageWindow(sessionId, listener)
            },
            [sessionId]
        ),
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

        void ensureSessionLatestWindow(api, sessionId)
    }, [api, sessionId])

    useEffect(() => {
        if (!sessionId) {
            return
        }
        return () => {
            flushMessageWindowSnapshot(sessionId)
        }
    }, [sessionId])

    const loadHistoryUntilPreviousUser = useCallback(async () => {
        if (!api || !sessionId) {
            return DID_NOT_LOAD_OLDER_MESSAGES_RESULT
        }
        if (!state.hasMore || state.isLoadingMore) {
            return DID_NOT_LOAD_OLDER_MESSAGES_RESULT
        }
        return await fetchOlderMessagesUntilPreviousUser(api, sessionId)
    }, [api, sessionId, state.hasMore, state.isLoadingMore])

    const flushPending = useCallback(async () => {
        if (!sessionId) return
        const needsRefresh = flushPendingMessages(sessionId)
        if (needsRefresh && api) {
            await fetchLatestMessages(api, sessionId)
        }
    }, [api, sessionId])

    const setAtBottom = useCallback(
        (atBottom: boolean) => {
            if (!sessionId) return
            setMessageWindowAtBottom(sessionId, atBottom)
        },
        [sessionId]
    )

    return {
        messages: state.messages,
        warning: state.warning,
        isLoading: state.isLoading,
        isLoadingMore: state.isLoadingMore,
        hasMore: state.hasMore,
        pendingCount: state.pendingCount,
        atBottom: state.atBottom,
        hasLoadedLatest: state.hasLoadedLatest,
        messagesVersion: state.messagesVersion,
        pendingReply: state.pendingReply,
        stream: state.stream,
        streamVersion: state.streamVersion,
        loadHistoryUntilPreviousUser,
        flushPending,
        setAtBottom,
    }
}
