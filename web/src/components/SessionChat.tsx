import { Suspense, lazy, useCallback, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { getLiveSessionConfigSupport } from '@viby/protocol'
import type { ApiClient } from '@/api/client'
import type {
    AttachmentMetadata,
    DecryptedMessage,
    Session,
    SessionStreamState
} from '@/types/api'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import type { LoadMoreMessagesResult } from '@/lib/message-window-store'
import { SessionHeader } from '@/components/SessionHeader'
import { TeamPanel } from '@/components/TeamPanel'
import { useSessionActions } from '@/hooks/mutations/useSessionActions'
import {
    runPreloadedNavigation,
} from '@/lib/navigationTransition'
import { SessionChatPendingState } from '@/components/loading/SessionChatPendingState'
import {
    loadSessionFilesRouteModule,
    preloadSessionTerminalExperience
} from '@/routes/sessions/sessionRoutePreload'

const SessionChatWorkspace = lazy(() => import('@/components/SessionChatWorkspace'))

type SessionChatProps = {
    api: ApiClient
    session: Session
    isDetailPending?: boolean
    messages: DecryptedMessage[]
    messagesWarning: string | null
    hasMoreMessages: boolean
    isLoadingMessages: boolean
    isLoadingMoreMessages: boolean
    isSending: boolean
    isResumingSession: boolean
    pendingCount: number
    hasLoadedLatestMessages: boolean
    messagesVersion: number
    stream: SessionStreamState | null
    streamVersion: number
    onBack: () => void
    onRefresh: () => void
    onLoadMore: () => Promise<LoadMoreMessagesResult>
    onLoadHistoryUntilPreviousUser: () => Promise<LoadMoreMessagesResult>
    onSend: (text: string, attachments?: AttachmentMetadata[]) => void
    onFlushPending: () => void
    onAtBottomChange: (atBottom: boolean) => void
    onRetryMessage?: (localId: string) => void
    ensureSessionReady?: () => Promise<void>
    autocompleteSuggestions?: (query: string) => Promise<Suggestion[]>
}

export function SessionChat(props: SessionChatProps): React.JSX.Element {
    const navigate = useNavigate()
    const {
        api,
        autocompleteSuggestions,
        hasMoreMessages,
        isDetailPending,
        isLoadingMessages,
        isLoadingMoreMessages,
        isSending,
        isResumingSession,
        messages,
        messagesVersion,
        messagesWarning,
        onAtBottomChange,
        onBack,
        onFlushPending,
        onLoadHistoryUntilPreviousUser,
        onLoadMore,
        onRefresh,
        onRetryMessage,
        onSend,
        pendingCount,
        hasLoadedLatestMessages,
        ensureSessionReady,
        session,
        stream,
        streamVersion
    } = props
    const sessionId = session.id
    const agentFlavor = session.metadata?.flavor ?? null
    const liveConfigSupport = getLiveSessionConfigSupport(session)
    const {
        abortSession,
        unarchiveSession,
        switchSession
    } = useSessionActions(
        api,
        sessionId,
        agentFlavor,
        {
            liveConfigSupport
        }
    )

    const handleAbort = useCallback(async () => {
        await abortSession()
    }, [abortSession])

    const handleSwitchToRemote = useCallback(async () => {
        await switchSession()
        onRefresh()
    }, [onRefresh, switchSession])

    const navigateToSessionWorkspaceRoute = useCallback((route: 'files' | 'terminal') => {
        const recoveryHref = `/sessions/${sessionId}/${route}`
        const preload = route === 'files'
            ? loadSessionFilesRouteModule()
            : preloadSessionTerminalExperience()

        runPreloadedNavigation(
            preload,
            () => {
                if (route === 'files') {
                    void navigate({
                        to: '/sessions/$sessionId/files',
                        params: { sessionId }
                    })
                    return
                }

                void navigate({
                    to: '/sessions/$sessionId/terminal',
                    params: { sessionId }
                })
            },
            recoveryHref
        )
    }, [navigate, sessionId])

    const handleViewFiles = useCallback(() => {
        navigateToSessionWorkspaceRoute('files')
    }, [navigateToSessionWorkspaceRoute])

    const handleViewTerminal = useCallback(() => {
        navigateToSessionWorkspaceRoute('terminal')
    }, [navigateToSessionWorkspaceRoute])

    const headerNavigation = useMemo(() => ({
        onBack,
        onViewFiles: session.metadata?.path ? handleViewFiles : undefined,
        onViewTerminal: session.active ? handleViewTerminal : undefined
    }), [
        handleViewFiles,
        handleViewTerminal,
        onBack,
        session.active,
        session.metadata?.path
    ])

    const showDetailPendingShell = messages.length === 0 && (
        isDetailPending === true || !hasLoadedLatestMessages
    )
    const workspaceMessageState = useMemo(() => ({
        messages,
        warning: messagesWarning,
        hasMore: hasMoreMessages,
        isLoading: isLoadingMessages,
        isLoadingMore: isLoadingMoreMessages,
        isSending,
        pendingCount,
        messagesVersion,
        stream,
        streamVersion
    }), [
        hasMoreMessages,
        isLoadingMessages,
        isLoadingMoreMessages,
        isSending,
        messages,
        messagesVersion,
        messagesWarning,
        pendingCount,
        stream,
        streamVersion
    ])
    const workspaceActions = useMemo(() => ({
        onRefresh,
        onLoadMore,
        onLoadHistoryUntilPreviousUser,
        onSend,
        onFlushPending,
        onAtBottomChange,
        onRetryMessage,
        onAbort: handleAbort,
        onUnarchiveSession: unarchiveSession,
        onSwitchToRemote: handleSwitchToRemote
    }), [
        handleAbort,
        handleSwitchToRemote,
        onAtBottomChange,
        onFlushPending,
        onLoadHistoryUntilPreviousUser,
        onLoadMore,
        onRefresh,
        onRetryMessage,
        onSend,
        unarchiveSession
    ])
    const workspaceRuntimeOptions = useMemo(() => ({
        liveConfigSupport,
        ensureSessionReady,
        isResumingSession,
        autocompleteSuggestions
    }), [autocompleteSuggestions, ensureSessionReady, isResumingSession, liveConfigSupport])

    return (
        <div className="session-chat-page flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden">
            <SessionHeader
                session={session}
                navigation={headerNavigation}
            />

            {session.teamState && (
                <TeamPanel teamState={session.teamState} />
            )}

            <div className="session-chat-page-body min-h-0 flex-1 overflow-hidden">
                {showDetailPendingShell ? (
                    <SessionChatLoadingShell />
                ) : (
                    <Suspense fallback={<SessionChatLoadingShell />}>
                        <SessionChatWorkspace
                            api={api}
                            session={session}
                            messageState={workspaceMessageState}
                            actions={workspaceActions}
                            runtimeOptions={workspaceRuntimeOptions}
                        />
                    </Suspense>
                )}
            </div>
        </div>
    )
}

function SessionChatLoadingShell(): React.JSX.Element {
    return <SessionChatPendingState testId="session-chat-detail-pending" />
}
