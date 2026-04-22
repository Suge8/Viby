import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { getLiveSessionConfigSupport, resolveSessionInteractivity } from '@viby/protocol'
import { useCallback, useMemo } from 'react'
import type { ApiClient } from '@/api/client'
import { SessionChat } from '@/components/SessionChat'
import type {
    SessionChatWorkspaceActionHandlers,
    SessionChatWorkspaceMessageState,
    SessionChatWorkspaceRuntimeOptions,
} from '@/components/sessionChatWorkspaceTypes'
import { useMessages } from '@/hooks/queries/useMessages'
import { useSession } from '@/hooks/queries/useSession'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { resolveCommandSuggestionNavigation } from '@/lib/commandSuggestionActions'
import { runPreloadedNavigation } from '@/lib/navigationTransition'
import { useSessionChatTracing } from '@/routes/sessions/sessionChatRouteRuntime'
import {
    useRefreshSelectedSession,
    useSessionAutocompleteSuggestions,
    useSessionChatSendActions,
} from '@/routes/sessions/sessionChatRouteSupport'
import { useResolvedPostSwitchWarningSync } from '@/routes/sessions/sessionChatWarningSync'
import { buildSessionFilesPath, buildSessionTerminalPath } from '@/routes/sessions/sessionRoutePaths'
import { loadSessionFilesRouteModule, preloadSessionTerminalExperience } from '@/routes/sessions/sessionRoutePreload'

const SESSION_WORKSPACE_FILES_ROUTE = 'files',
    SESSION_WORKSPACE_TERMINAL_ROUTE = 'terminal'
type SessionWorkspaceRoute = typeof SESSION_WORKSPACE_FILES_ROUTE | typeof SESSION_WORKSPACE_TERMINAL_ROUTE

export type SessionChatRouteModelOptions = {
    api: ApiClient
    session: NonNullable<ReturnType<typeof useSession>['session']>
    sessionId: string
}

export type SessionChatRouteViewModel = {
    isSessionDetailReady: boolean
    sessionChatProps: React.ComponentProps<typeof SessionChat>
}

function getSessionWorkspaceNavigationTarget(
    route: SessionWorkspaceRoute,
    sessionId: string
): {
    preload: Promise<unknown>
    recoveryHref: string
    to: '/sessions/$sessionId/files' | '/sessions/$sessionId/terminal'
} {
    if (route === SESSION_WORKSPACE_FILES_ROUTE) {
        return {
            preload: loadSessionFilesRouteModule(),
            recoveryHref: buildSessionFilesPath(sessionId),
            to: '/sessions/$sessionId/files',
        }
    }

    return {
        preload: preloadSessionTerminalExperience(),
        recoveryHref: buildSessionTerminalPath(sessionId),
        to: '/sessions/$sessionId/terminal',
    }
}

export function useSessionChatRouteModel(options: SessionChatRouteModelOptions): SessionChatRouteViewModel {
    const goBack = useAppGoBack()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { api, session, sessionId } = options
    const {
        messages,
        warning: messagesWarning,
        isLoading: messagesLoading,
        isLoadingMore: messagesLoadingMore,
        hasMore: messagesHasMore,
        loadHistoryUntilPreviousUser,
        pendingCount,
        atBottom,
        hasLoadedLatest,
        messagesVersion,
        pendingReply,
        stream,
        streamVersion,
        flushPending,
        setAtBottom,
    } = useMessages(api, sessionId)
    useSessionChatTracing({
        sessionId,
        thinking: session.thinking,
        pendingReply,
        stream,
    })

    const { retryAvailable } = resolveSessionInteractivity(session)
    useResolvedPostSwitchWarningSync({
        sessionId,
        messages,
        messagesWarning,
        streamText: stream?.text ?? '',
    })
    const { sendMessage, retryMessage, isSending } = useSessionChatSendActions({
        api,
        queryClient,
        sessionId,
    })
    const { autocompleteRefreshKey, getSuggestions: autocompleteSuggestions } = useSessionAutocompleteSuggestions({
        api,
        queryClient,
        session,
        sessionId,
    })
    const refreshSelectedSession = useRefreshSelectedSession({
        api,
        queryClient,
        sessionId,
    })
    const messageState = useMemo<SessionChatWorkspaceMessageState>(
        () => ({
            messages,
            warning: messagesWarning,
            hasMore: messagesHasMore,
            isLoading: messagesLoading,
            isLoadingMore: messagesLoadingMore,
            isSending,
            pendingCount,
            atBottom,
            messagesVersion,
            pendingReply,
            stream,
            streamVersion,
        }),
        [
            atBottom,
            isSending,
            messages,
            messagesHasMore,
            messagesLoading,
            messagesLoadingMore,
            messagesVersion,
            messagesWarning,
            pendingCount,
            pendingReply,
            stream,
            streamVersion,
        ]
    )
    const runtimeOptions = useMemo<SessionChatWorkspaceRuntimeOptions>(
        () => ({
            liveConfigSupport: getLiveSessionConfigSupport(session),
            autocompleteSuggestions,
            autocompleteRefreshKey,
        }),
        [autocompleteRefreshKey, autocompleteSuggestions, session]
    )
    const actions = useMemo<
        Pick<
            SessionChatWorkspaceActionHandlers,
            | 'onAtBottomChange'
            | 'onFlushPending'
            | 'onLoadHistoryUntilPreviousUser'
            | 'onRefresh'
            | 'onRetryMessage'
            | 'onSend'
        >
    >(
        () => ({
            onRefresh: refreshSelectedSession,
            onLoadHistoryUntilPreviousUser: loadHistoryUntilPreviousUser,
            onSend: sendMessage,
            onFlushPending: flushPending,
            onAtBottomChange: setAtBottom,
            onRetryMessage: retryAvailable ? retryMessage : undefined,
        }),
        [
            flushPending,
            loadHistoryUntilPreviousUser,
            refreshSelectedSession,
            retryAvailable,
            retryMessage,
            sendMessage,
            setAtBottom,
        ]
    )

    const workspace = useMemo(
        () => ({
            api,
            session,
            messageState,
            runtimeOptions,
        }),
        [api, messageState, runtimeOptions, session]
    )
    const navigateToSessionWorkspaceRoute = useCallback(
        (route: SessionWorkspaceRoute) => {
            const target = getSessionWorkspaceNavigationTarget(route, sessionId)

            runPreloadedNavigation(
                target.preload,
                () => {
                    void navigate({
                        to: target.to,
                        params: { sessionId },
                    })
                },
                target.recoveryHref
            )
        },
        [navigate, sessionId]
    )
    const handleViewFiles = useCallback(() => {
        navigateToSessionWorkspaceRoute(SESSION_WORKSPACE_FILES_ROUTE)
    }, [navigateToSessionWorkspaceRoute])
    const handleViewTerminal = useCallback(() => {
        navigateToSessionWorkspaceRoute(SESSION_WORKSPACE_TERMINAL_ROUTE)
    }, [navigateToSessionWorkspaceRoute])
    const handleSuggestionAction = useCallback(
        (suggestion: Suggestion) => {
            const target = resolveCommandSuggestionNavigation(suggestion)
            if (!target) {
                return
            }
            void navigate(target)
        },
        [navigate]
    )

    return {
        isSessionDetailReady: hasLoadedLatest,
        sessionChatProps: {
            workspace,
            actions,
            onBack: goBack,
            onSuggestionAction: handleSuggestionAction,
            onViewFiles: session.metadata?.path ? handleViewFiles : undefined,
            onViewTerminal: session.active ? handleViewTerminal : undefined,
        },
    }
}
