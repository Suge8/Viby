import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { Session } from '@/types/api'
import { SessionChat } from '@/components/SessionChat'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useSendMessage } from '@/hooks/mutations/useSendMessage'
import { useMessages } from '@/hooks/queries/useMessages'
import { useSession } from '@/hooks/queries/useSession'
import { getMessageWindowState } from '@/lib/messageWindowStoreCore'
import { loadMessageWindowStoreAsyncModule } from '@/lib/messageWindowStoreModule'
import { useNoticeCenter } from '@/lib/notice-center'
import { queryKeys } from '@/lib/query-keys'
import { appendRealtimeTrace } from '@/lib/realtimeTrace'
import { runSendCatchup } from '@/lib/sendCatchup'
import { writeSessionToQueryCache } from '@/lib/sessionQueryCache'
import { createSessionAutocompleteSuggestions } from '@/routes/sessions/sessionAutocomplete'
import {
    useSessionChatTracing,
    useSessionResumeController
} from '@/routes/sessions/sessionChatRouteRuntime'
import { useTranslation } from '@/lib/use-translation'

type SessionChatRouteModelOptions = {
    api: ApiClient
    hasWarmSessionSnapshot: boolean
    isDetailPending: boolean
    refetchSession: ReturnType<typeof useSession>['refetch']
    session: NonNullable<ReturnType<typeof useSession>['session']>
    sessionId: string
}

export function useSessionChatRouteModel(
    options: SessionChatRouteModelOptions
): React.ComponentProps<typeof SessionChat> {
    const { t } = useTranslation()
    const goBack = useAppGoBack()
    const queryClient = useQueryClient()
    const { addToast } = useNoticeCenter()
    const {
        api,
        hasWarmSessionSnapshot,
        isDetailPending,
        refetchSession,
        session,
        sessionId
    } = options
    const {
        messages,
        warning: messagesWarning,
        isLoading: messagesLoading,
        isLoadingMore: messagesLoadingMore,
        hasMore: messagesHasMore,
        loadMore: loadMoreMessages,
        loadHistoryUntilPreviousUser,
        refetch: refetchMessages,
        pendingCount,
        hasLoadedLatest,
        messagesVersion,
        pendingReply,
        stream,
        streamVersion,
        flushPending,
        setAtBottom,
    } = useMessages(api, sessionId)
    const {
        ensureSessionReady,
        warmSession,
        isResumingSession
    } = useSessionResumeController({
        api,
        queryClient,
        session
    })

    useSessionChatTracing({
        sessionId,
        thinking: session.thinking,
        pendingReply,
        stream
    })

    const handleSendBlocked = useCallback((reason: 'no-api' | 'no-session' | 'pending') => {
        if (reason !== 'no-api') {
            return
        }

        addToast({
            title: t('send.blocked.title'),
            description: t('send.blocked.noConnection'),
            tone: 'warning',
            href: `/sessions/${sessionId}`
        })
    }, [addToast, sessionId, t])

    const handleAfterServerAccepted = useCallback(async ({
        sessionId: acceptedSessionId,
        createdAt,
        acceptedAt,
        session: acceptedSession
    }: {
        sessionId: string
        localId: string
        createdAt: number
        acceptedAt: number
        session: Session
    }) => {
        appendRealtimeTrace({
            at: acceptedAt,
            type: 'server_accepted',
            details: {
                sessionId: acceptedSessionId,
                waitMs: acceptedAt - createdAt
            }
        })

        writeSessionToQueryCache(queryClient, acceptedSession)

        await runSendCatchup({
            createdAt,
            onReplyDetected: ({ reply, attempt }) => {
                appendRealtimeTrace({
                    at: Date.now(),
                    type: 'first_reply_detected',
                    details: {
                        sessionId: acceptedSessionId,
                        replyId: reply.id,
                        replyCreatedAt: reply.createdAt,
                        attempt,
                        waitMs: Date.now() - createdAt
                    }
                })
            },
            syncOnce: async () => {
                await queryClient.fetchQuery({
                    queryKey: queryKeys.session(acceptedSessionId),
                    queryFn: () => api.getSession(acceptedSessionId),
                })

                const { fetchLatestMessages } = await loadMessageWindowStoreAsyncModule()
                await fetchLatestMessages(api, acceptedSessionId)

                return {
                    messages: getMessageWindowState(acceptedSessionId).messages
                }
            }
        })
    }, [api, queryClient])

    const { sendMessage, retryMessage, isSending } = useSendMessage(api, sessionId, {
        onBlocked: handleSendBlocked,
        onSendStart: ({ sessionId: sendingSessionId, localId, createdAt, attachmentsCount }) => {
            appendRealtimeTrace({
                at: Date.now(),
                type: 'message_send_start',
                details: {
                    sessionId: sendingSessionId,
                    localId,
                    createdAt,
                    attachmentsCount
                }
            })
        },
        afterServerAccepted: handleAfterServerAccepted
    })

    const agentType = session.metadata?.flavor ?? 'claude'
    const autocompleteSuggestions = useMemo(() => createSessionAutocompleteSuggestions({
        agentType,
        api,
        queryClient,
        sessionId
    }), [agentType, api, queryClient, sessionId])

    const refreshSelectedSession = useCallback(() => {
        void refetchSession()
        void refetchMessages()
    }, [refetchMessages, refetchSession])

    return {
        api,
        hasWarmSessionSnapshot,
        session,
        isDetailPending,
        messages,
        messagesWarning,
        hasMoreMessages: messagesHasMore,
        isLoadingMessages: messagesLoading,
        isLoadingMoreMessages: messagesLoadingMore,
        isSending,
        isResumingSession,
        pendingCount,
        hasLoadedLatestMessages: hasLoadedLatest,
        messagesVersion,
        pendingReply,
        stream,
        streamVersion,
        onBack: goBack,
        onRefresh: refreshSelectedSession,
        onLoadMore: loadMoreMessages,
        onLoadHistoryUntilPreviousUser: loadHistoryUntilPreviousUser,
        onSend: sendMessage,
        onFlushPending: flushPending,
        onAtBottomChange: setAtBottom,
        onRetryMessage: retryMessage,
        ensureSessionReady,
        warmSession,
        autocompleteSuggestions
    }
}
