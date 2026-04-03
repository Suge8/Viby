import { Suspense, lazy, memo, useMemo } from 'react'
import { resolveAssistantReplyingPhase } from '@/components/AssistantChat/assistantReplyingPhase'
import type { VibyComposerModel } from '@/components/AssistantChat/composerTypes'
import { SessionChatWorkspaceComposerFallback } from '@/components/SessionChatWorkspaceFallbacks'
import { useSessionLiveConfigControls } from '@/components/useSessionLiveConfigControls'
import type {
    SessionChatWorkspaceActionHandlers,
    SessionChatWorkspaceMessageState,
    SessionChatWorkspaceRuntimeOptions
} from '@/components/sessionChatWorkspaceTypes'
import type { ApiClient } from '@/api/client'
import type { Session } from '@/types/api'

let vibyComposerModulePromise: Promise<{ default: typeof import('@/components/AssistantChat/VibyComposer').VibyComposer }> | null = null

function loadVibyComposerModule() {
    vibyComposerModulePromise ??= import('@/components/AssistantChat/VibyComposer').then((module) => ({
        default: module.VibyComposer
    }))
    return vibyComposerModulePromise
}

const LazyVibyComposer = lazy(loadVibyComposerModule)

type SessionChatComposerSurfaceProps = {
    workspace: Pick<{
        api: ApiClient
        session: Session
        runtimeOptions: SessionChatWorkspaceRuntimeOptions
    }, 'api' | 'session' | 'runtimeOptions'>
    composer: {
        messageState: Pick<SessionChatWorkspaceMessageState, 'isSending' | 'pendingReply'>
        actions: Pick<
            SessionChatWorkspaceActionHandlers,
            'isSwitchingSessionDriver' | 'onSwitchSessionDriver'
        >
        allowSendWhenInactive: boolean
        attachmentsSupported: boolean
        disabled: boolean
        containerRef: React.RefObject<HTMLDivElement | null>
    }
}

function SessionChatComposerSurfaceInner(props: SessionChatComposerSurfaceProps): React.JSX.Element {
    const {
        workspace: { api, session, runtimeOptions },
        composer: {
            messageState,
            actions,
            allowSendWhenInactive,
            attachmentsSupported,
            disabled,
            containerRef
        }
    } = props
    const replyingPhase = useMemo(() => {
        return resolveAssistantReplyingPhase({
            isResponding: session.thinking,
            pendingReply: messageState.pendingReply
        })
    }, [messageState.pendingReply, session.thinking])

    const {
        composerConfig,
        composerHandlers
    } = useSessionLiveConfigControls({
        api,
        session,
        liveConfigSupport: runtimeOptions.liveConfigSupport,
        onSwitchSessionDriver: actions.onSwitchSessionDriver,
        isSwitchingSessionDriver: actions.isSwitchingSessionDriver,
        autocompleteSuggestions: runtimeOptions.autocompleteSuggestions,
        attachmentsSupported,
        allowSendWhenInactive,
        isResumingSession: runtimeOptions.isResumingSession ?? false
    })

    const composerModel = useMemo<VibyComposerModel>(() => ({
        sessionId: session.id,
        disabled,
        onWarmSession: runtimeOptions.warmSession,
        replyingPhase,
        config: composerConfig,
        handlers: composerHandlers,
        containerRef
    }), [
        composerConfig,
        composerHandlers,
        containerRef,
        disabled,
        replyingPhase,
        runtimeOptions.warmSession,
        session.id
    ])

    return (
        <Suspense fallback={<SessionChatWorkspaceComposerFallback />}>
            <LazyVibyComposer
                model={composerModel}
                key={`composer:${session.id}`}
            />
        </Suspense>
    )
}

export const SessionChatComposerSurface = memo(SessionChatComposerSurfaceInner)
