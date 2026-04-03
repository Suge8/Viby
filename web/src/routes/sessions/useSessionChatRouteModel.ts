import { useCallback, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { resolveSessionDriver } from '@viby/protocol'
import type { ApiClient } from '@/api/client'
import { SessionChat } from '@/components/SessionChat'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useSendMessage } from '@/hooks/mutations/useSendMessage'
import { useMessages } from '@/hooks/queries/useMessages'
import { useSession } from '@/hooks/queries/useSession'
import { appendRealtimeTrace } from '@/lib/realtimeTrace'
import { formatSessionRecoveryErrorMessage } from '@/lib/sessionRecoveryError'
import { useNoticeCenter } from '@/lib/notice-center'
import { useTranslation } from '@/lib/use-translation'
import { createSessionAutocompleteSuggestions } from '@/routes/sessions/sessionAutocomplete'
import {
    type AcceptedSend,
    handleAcceptedSend,
    syncResolvedPostSwitchWarning
} from '@/routes/sessions/postSwitchSendRecovery'
import {
    useSessionChatTracing,
    useSessionResumeController
} from '@/routes/sessions/sessionChatRouteRuntime'

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

    useEffect(() => {
        syncResolvedPostSwitchWarning({
            sessionId,
            messages,
            warning: messagesWarning,
            streamText: stream?.text ?? ''
        })
    }, [messages, messagesWarning, sessionId, stream?.text])

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

    const handleAfterServerAccepted = useCallback(async (acceptedSend: AcceptedSend) => {
        await handleAcceptedSend({
            acceptedSend,
            api,
            queryClient
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
        afterServerAccepted: handleAfterServerAccepted,
        onSendError: ({ sessionId: failedSessionId, error }) => {
            addToast({
                title: t('chat.resumeFailed.title'),
                description: formatSessionRecoveryErrorMessage(error, t),
                tone: 'danger',
                href: `/sessions/${failedSessionId}`
            })
        }
    })

    const sessionDriver = resolveSessionDriver(session.metadata)
    const autocompleteSuggestions = useMemo(() => createSessionAutocompleteSuggestions({
        driver: sessionDriver,
        api,
        queryClient,
        sessionId
    }), [api, queryClient, sessionDriver, sessionId])

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
