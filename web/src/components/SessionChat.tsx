import { Suspense, lazy, useCallback, useEffect, useMemo } from 'react'
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
import type { PendingReplyState } from '@/lib/message-window-store'
import type { LoadMoreMessagesResult } from '@/lib/message-window-store'
import type { MessageWindowWarningKey } from '@/lib/messageWindowWarnings'
import { SessionHeader } from '@/components/SessionHeader'
import { SessionChatTeamSurface } from '@/components/session-chat/SessionChatTeamSurface'
import { useSessionActions } from '@/hooks/mutations/useSessionActions'
import {
    runPreloadedNavigation,
} from '@/lib/navigationTransition'
import { SessionChatPendingState } from '@/components/loading/SessionChatPendingState'
import {
    shouldPreloadSessionChatWorkspace,
    shouldShowSessionChatPendingShell
} from '@/components/sessionChatLoadingContract'
import {
    loadSessionChatWorkspaceModule,
    loadSessionFilesRouteModule,
    preloadSessionTerminalExperience
} from '@/routes/sessions/sessionRoutePreload'

const SessionChatWorkspace = lazy(loadSessionChatWorkspaceModule)
const SESSION_CHAT_ENTER_SURFACE_CLASS_NAME = 'session-chat-enter-surface'
const SESSION_CHAT_ENTER_BODY_CLASS_NAME = 'session-chat-enter-body'
const SESSION_WORKSPACE_FILES_ROUTE = 'files'
const SESSION_WORKSPACE_TERMINAL_ROUTE = 'terminal'

type SessionWorkspaceRoute = typeof SESSION_WORKSPACE_FILES_ROUTE | typeof SESSION_WORKSPACE_TERMINAL_ROUTE

type SessionChatProps = {
    api: ApiClient
    session: Session
    isDetailPending?: boolean
    hasWarmSessionSnapshot?: boolean
    messages: DecryptedMessage[]
    messagesWarning: MessageWindowWarningKey | null
    hasMoreMessages: boolean
    isLoadingMessages: boolean
    isLoadingMoreMessages: boolean
    isSending: boolean
    isResumingSession: boolean
    pendingCount: number
    hasLoadedLatestMessages: boolean
    messagesVersion: number
    pendingReply: PendingReplyState | null
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
    warmSession?: () => void
    autocompleteSuggestions?: (query: string) => Promise<Suggestion[]>
}

export function SessionChat(props: SessionChatProps): React.JSX.Element {
    const navigate = useNavigate()
    const {
        api,
        autocompleteSuggestions,
        hasMoreMessages,
        hasWarmSessionSnapshot,
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
        warmSession,
        session,
        pendingReply,
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
    }, [switchSession])

    const navigateToSessionWorkspaceRoute = useCallback((route: SessionWorkspaceRoute) => {
        const recoveryHref = `/sessions/${sessionId}/${route}`
        const preload = route === SESSION_WORKSPACE_FILES_ROUTE
            ? loadSessionFilesRouteModule()
            : preloadSessionTerminalExperience()

        runPreloadedNavigation(
            preload,
            () => {
                if (route === SESSION_WORKSPACE_FILES_ROUTE) {
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
        navigateToSessionWorkspaceRoute(SESSION_WORKSPACE_FILES_ROUTE)
    }, [navigateToSessionWorkspaceRoute])

    const handleViewTerminal = useCallback(() => {
        navigateToSessionWorkspaceRoute(SESSION_WORKSPACE_TERMINAL_ROUTE)
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

    const showDetailPendingShell = shouldShowSessionChatPendingShell({
        messagesCount: messages.length,
        isDetailPending,
        hasLoadedLatestMessages,
        hasWarmSessionSnapshot
    })
    const shouldPreloadWorkspace = shouldPreloadSessionChatWorkspace({
        messagesCount: messages.length,
        isDetailPending,
        hasLoadedLatestMessages,
        hasWarmSessionSnapshot
    })

    useEffect(() => {
        if (!shouldPreloadWorkspace) {
            return
        }

        void loadSessionChatWorkspaceModule()
    }, [shouldPreloadWorkspace])

    const workspaceMessageState = useMemo(() => ({
        messages,
        warning: messagesWarning,
        hasMore: hasMoreMessages,
        isLoading: isLoadingMessages,
        isLoadingMore: isLoadingMoreMessages,
        isSending,
        pendingCount,
        messagesVersion,
        pendingReply,
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
        pendingReply,
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
        warmSession,
        isResumingSession,
        autocompleteSuggestions
    }), [autocompleteSuggestions, ensureSessionReady, isResumingSession, liveConfigSupport, warmSession])

    return (
        <div className={`session-chat-page ${SESSION_CHAT_ENTER_SURFACE_CLASS_NAME} flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden`}>
            <SessionHeader
                session={session}
                navigation={headerNavigation}
            />

            <SessionChatTeamSurface api={api} session={session} />

            <div className={`session-chat-page-body ${SESSION_CHAT_ENTER_BODY_CLASS_NAME} min-h-0 flex-1 overflow-hidden`}>
                {showDetailPendingShell ? (
                    <SessionChatLoadingShell />
                ) : (
                    <Suspense fallback={<SessionChatWorkspaceFallback />}>
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

function SessionChatWorkspaceFallback(): React.JSX.Element {
    return <SessionChatPendingState testId="session-chat-workspace-pending" />
}
