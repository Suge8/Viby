import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { ApiError } from '@/api/client'
import { SessionChat } from '@/components/SessionChat'
import { RouteLoadingFallback } from '@/components/loading/RouteLoadingFallback'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useSendMessage } from '@/hooks/mutations/useSendMessage'
import { useMessages } from '@/hooks/queries/useMessages'
import { useSession } from '@/hooks/queries/useSession'
import { useSkills } from '@/hooks/queries/useSkills'
import { useSlashCommands } from '@/hooks/queries/useSlashCommands'
import { useSessionTargetResolver } from '@/hooks/useSessionTargetResolver'
import { useAppContext } from '@/lib/app-context'
import { fetchLatestMessages, getMessageWindowState } from '@/lib/message-window-store'
import { useNoticeCenter } from '@/lib/notice-center'
import { getNoticePreset } from '@/lib/noticePresets'
import { queryKeys } from '@/lib/query-keys'
import { appendRealtimeTrace } from '@/lib/realtimeTrace'
import { runSendCatchup } from '@/lib/sendCatchup'
import { writeSessionToQueryCache } from '@/lib/sessionQueryCache'
import { useTranslation } from '@/lib/use-translation'

function getResumeErrorCode(error: unknown): string | null {
    if (error instanceof ApiError) {
        return typeof error.code === 'string' ? error.code : null
    }

    if (!error || typeof error !== 'object') {
        return null
    }

    return typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : null
}

function formatResumeErrorMessage(error: unknown, t: (key: string) => string): string {
    switch (getResumeErrorCode(error)) {
        case 'session_archived':
            return t('chat.resumeFailed.sessionArchived')
        case 'resume_unavailable':
            return t('chat.resumeFailed.resumeUnavailable')
        case 'no_machine_online':
            return t('chat.resumeFailed.noMachineOnline')
        case 'session_not_found':
            return t('chat.resumeFailed.sessionNotFound')
        case 'resume_failed':
            return t('chat.resumeFailed.resumeFailed')
        default:
            break
    }

    return error instanceof Error ? error.message : t('chat.resumeFailed.generic')
}

export default function SessionChatRoute(): React.JSX.Element {
    const { api } = useAppContext()
    const { t } = useTranslation()
    const { addToast } = useNoticeCenter()
    const errorPreset = getNoticePreset('genericError', t)
    const { sessionId: routeSessionId } = useParams({ from: '/sessions/$sessionId' })

    useEffect(() => {
        appendRealtimeTrace({
            at: Date.now(),
            type: 'chat_opened',
            details: { sessionId: routeSessionId }
        })
    }, [routeSessionId])
    const {
        session,
        error: sessionError,
        refetch: refetchSession,
        isPlaceholderData
    } = useSession(api, routeSessionId)

    const navigate = useNavigate()

    useEffect(() => {
        if (!sessionError) {
            return
        }

        addToast({
            title: errorPreset.title,
            description: sessionError,
            tone: 'danger',
            href: '/sessions'
        })

        void navigate({
            to: '/sessions',
            replace: true
        })
    }, [addToast, errorPreset.title, navigate, sessionError])

    if (sessionError || !session) {
        return <RouteLoadingFallback kind="session" testId="session-route-pending" />
    }

    return (
        <ResolvedSessionChatRoute
            api={api}
            isDetailPending={isPlaceholderData}
            refetchSession={refetchSession}
            session={session}
            sessionId={routeSessionId}
        />
    )
}

type ResolvedSessionChatRouteProps = {
    api: ReturnType<typeof useAppContext>['api']
    isDetailPending: boolean
    refetchSession: ReturnType<typeof useSession>['refetch']
    session: NonNullable<ReturnType<typeof useSession>['session']>
    sessionId: string
}

function ResolvedSessionChatRoute(props: ResolvedSessionChatRouteProps): React.JSX.Element {
    const { t } = useTranslation()
    const goBack = useAppGoBack()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { addToast } = useNoticeCenter()
    const { api, isDetailPending, refetchSession, session, sessionId } = props
    const [isResumingSession, setIsResumingSession] = useState(false)
    const mountedRef = useRef(true)
    const resumingCountRef = useRef(0)

    useEffect(() => {
        return () => {
            mountedRef.current = false
        }
    }, [])

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
        stream,
        streamVersion,
        flushPending,
        setAtBottom,
    } = useMessages(api, sessionId)
    const ensureSessionReadyBase = useSessionTargetResolver({
        api,
        session,
        onReady: (resumedSession) => {
            writeSessionToQueryCache(queryClient, resumedSession)
        },
        onError: (error, currentSessionId) => {
            addToast({
                title: t('chat.resumeFailed.title'),
                description: formatResumeErrorMessage(error, t),
                tone: 'danger',
                href: `/sessions/${currentSessionId}`
            })
        }
    })
    const ensureSessionReady = useCallback(async () => {
        if (session.active) {
            return
        }

        resumingCountRef.current += 1
        if (mountedRef.current) {
            setIsResumingSession(true)
        }

        try {
            await ensureSessionReadyBase()
        } finally {
            resumingCountRef.current = Math.max(0, resumingCountRef.current - 1)
            if (mountedRef.current && resumingCountRef.current === 0) {
                setIsResumingSession(false)
            }
        }
    }, [ensureSessionReadyBase, session.active])
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
        createdAt
    }: {
        sessionId: string
        localId: string
        createdAt: number
    }) => {
        if (!api) {
            return
        }

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

                await fetchLatestMessages(api, acceptedSessionId)

                return {
                    messages: getMessageWindowState(acceptedSessionId).messages
                }
            }
        })
    }, [api, queryClient])

    const { sendMessage, retryMessage, isSending } = useSendMessage(api, sessionId, {
        ensureSessionReady,
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
    const { getSuggestions: getSlashSuggestions } = useSlashCommands(api, sessionId, agentType)
    const { getSuggestions: getSkillSuggestions } = useSkills(api, sessionId)

    const getAutocompleteSuggestions = useCallback(async (query: string) => {
        if (query.startsWith('$')) {
            return await getSkillSuggestions(query)
        }
        return await getSlashSuggestions(query)
    }, [getSkillSuggestions, getSlashSuggestions])

    const refreshSelectedSession = useCallback(() => {
        void refetchSession()
        void refetchMessages()
    }, [refetchMessages, refetchSession])

    return (
        <SessionChat
            api={api}
            session={session}
            isDetailPending={isDetailPending}
            messages={messages}
            messagesWarning={messagesWarning}
            hasMoreMessages={messagesHasMore}
            isLoadingMessages={messagesLoading}
            isLoadingMoreMessages={messagesLoadingMore}
            isSending={isSending}
            isResumingSession={isResumingSession}
            pendingCount={pendingCount}
            hasLoadedLatestMessages={hasLoadedLatest}
            messagesVersion={messagesVersion}
            stream={stream}
            streamVersion={streamVersion}
            onBack={goBack}
            onRefresh={refreshSelectedSession}
            onLoadMore={loadMoreMessages}
            onLoadHistoryUntilPreviousUser={loadHistoryUntilPreviousUser}
            onSend={sendMessage}
            onFlushPending={flushPending}
            onAtBottomChange={setAtBottom}
            onRetryMessage={retryMessage}
            ensureSessionReady={ensureSessionReady}
            autocompleteSuggestions={getAutocompleteSuggestions}
        />
    )
}
