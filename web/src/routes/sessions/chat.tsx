import { useCallback, useEffect, useRef } from 'react'
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
import { fetchLatestMessages, getMessageWindowState, seedMessageWindowFromSession } from '@/lib/message-window-store'
import {
    runNavigationTransition,
    VIEW_TRANSITION_NAVIGATION_OPTIONS,
} from '@/lib/navigationTransition'
import { useNoticeCenter } from '@/lib/notice-center'
import { getNoticePreset } from '@/lib/noticePresets'
import { queryKeys } from '@/lib/query-keys'
import { appendRealtimeTrace } from '@/lib/realtimeTrace'
import { runSendCatchup } from '@/lib/sendCatchup'
import { useTranslation } from '@/lib/use-translation'

function formatResumeErrorMessage(error: unknown, t: (key: string) => string): string {
    if (error instanceof ApiError) {
        switch (error.code) {
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
                return t('chat.resumeFailed.generic')
        }
    }

    return error instanceof Error ? error.message : t('chat.resumeFailed.generic')
}

async function prefetchResolvedSessionData(options: {
    api: ReturnType<typeof useAppContext>['api']
    currentSessionId: string
    queryClient: QueryClient
    resolvedSessionId: string
    session: NonNullable<ReturnType<typeof useSession>['session']>
}): Promise<void> {
    const { api, currentSessionId, queryClient, resolvedSessionId, session } = options
    if (!api) {
        return
    }

    if (resolvedSessionId !== session.id) {
        seedMessageWindowFromSession(currentSessionId, resolvedSessionId)
        queryClient.setQueryData(queryKeys.session(resolvedSessionId), {
            session: { ...session, id: resolvedSessionId, active: true }
        })
    }

    try {
        await Promise.all([
            queryClient.prefetchQuery({
                queryKey: queryKeys.session(resolvedSessionId),
                queryFn: () => api.getSession(resolvedSessionId),
            }),
            fetchLatestMessages(api, resolvedSessionId),
        ])
    } catch {
    }
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
    const activeRouteSessionIdRef = useRef(sessionId)

    useEffect(() => {
        activeRouteSessionIdRef.current = sessionId
    }, [sessionId])

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
    const resolveSessionId = useSessionTargetResolver({
        api,
        session,
        onResolved: (currentSessionId, resolvedSessionId) => {
            void (async () => {
                await prefetchResolvedSessionData({
                    api,
                    currentSessionId,
                    queryClient,
                    resolvedSessionId,
                    session
                })

                if (activeRouteSessionIdRef.current !== currentSessionId) {
                    return
                }

                runNavigationTransition(() => {
                    navigate({
                        to: '/sessions/$sessionId',
                        params: { sessionId: resolvedSessionId },
                        replace: true
                    })
                }, VIEW_TRANSITION_NAVIGATION_OPTIONS)
            })()
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
        resolveSessionId,
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
            resolveSessionId={resolveSessionId}
            autocompleteSuggestions={getAutocompleteSuggestions}
        />
    )
}
