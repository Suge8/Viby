import { getSessionLifecycleState } from '@viby/protocol'
import { Suspense, lazy, useCallback, useMemo, useRef, useState } from 'react'
import { MemberReadOnlyComposer } from '@/components/MemberReadOnlyComposer'
import {
    SessionChatWorkspaceComposerFallback,
    SessionChatWorkspacePendingSurface
} from '@/components/SessionChatWorkspaceFallbacks'
import { SessionChatLocalNoticeStack } from '@/components/SessionChatLocalNoticeStack'
import { useChatViewportLayout } from '@/components/AssistantChat/useChatViewportLayout'
import { useElementHeight } from '@/hooks/useElementHeight'
import { useSessionChatLocalNotices } from '@/components/useSessionChatLocalNotices'
import {
    buildSessionChatLayoutStyle,
    type SessionChatLayoutStyle
} from '@/components/sessionChatLayoutStyle'
import type { AttachmentMetadata } from '@/types/api'
import {
    loadSessionChatComposerSurfaceModule,
    loadSessionChatRuntimeSurfaceModule
} from '@/components/sessionChatWorkspaceModules'
import type { SessionChatWorkspaceProps } from '@/components/sessionChatWorkspaceTypes'

const LazySessionChatRuntimeSurface = lazy(loadSessionChatRuntimeSurfaceModule)
const LazySessionChatComposerSurface = lazy(loadSessionChatComposerSurfaceModule)

export default function SessionChatWorkspace(props: SessionChatWorkspaceProps): React.JSX.Element {
    const { session, actions, messageState, runtimeOptions, persistComposerDraft = true } = props
    const lifecycleState = getSessionLifecycleState(session)
    const sessionInactive = lifecycleState !== 'running'
    const allowSendWhenInactive = sessionInactive
    const memberComposerLocked = session.teamContext?.sessionRole === 'member' && (
        session.teamContext.membershipState !== 'active'
        || session.teamContext.controlOwner !== 'user'
    )
    const [forceScrollToken, setForceScrollToken] = useState(0)
    const {
        isStandalone,
        isKeyboardOpen,
        bottomInsetPx,
        floatingControlBottomInsetPx
    } = useChatViewportLayout()
    const composerRef = useRef<HTMLDivElement | null>(null)
    const composerHeight = useElementHeight(composerRef)

    const handleSend = useCallback((text: string, attachments?: AttachmentMetadata[]) => {
        actions.onSend(text, attachments)
        setForceScrollToken((token) => token + 1)
    }, [actions.onSend])

    const handleRestoreSession = runtimeOptions.ensureSessionReady ?? actions.onUnarchiveSession

    const localNoticesModel = useSessionChatLocalNotices({
        sessionId: session.id,
        lifecycleState,
        messagesWarning: messageState.warning,
        onRestoreSession: handleRestoreSession
    })

    const chatLayoutStyle = useMemo<SessionChatLayoutStyle>(() => {
        return buildSessionChatLayoutStyle({
            composerHeight,
            bottomInsetPx,
            floatingControlBottomInsetPx
        })
    }, [bottomInsetPx, composerHeight, floatingControlBottomInsetPx])

    const runtimeSurface = useMemo(() => ({
        workspace: {
            api: props.api,
            session,
            messageState
        },
        runtime: {
            actions: {
                onAbort: actions.onAbort,
                onAtBottomChange: actions.onAtBottomChange,
                onFlushPending: actions.onFlushPending,
                onLoadHistoryUntilPreviousUser: actions.onLoadHistoryUntilPreviousUser,
                onLoadMore: actions.onLoadMore,
                onRefresh: actions.onRefresh,
                onRetryMessage: actions.onRetryMessage,
                onSend: handleSend
            },
            allowSendWhenInactive,
            forceScrollToken
        }
    }), [
        actions.onAbort,
        actions.onAtBottomChange,
        actions.onFlushPending,
        actions.onLoadHistoryUntilPreviousUser,
        actions.onLoadMore,
        actions.onRefresh,
        actions.onRetryMessage,
        allowSendWhenInactive,
        forceScrollToken,
        handleSend,
        messageState,
        props.api,
        session
    ])
    const composerSurface = useMemo(() => ({
        workspace: {
            api: props.api,
            session,
            runtimeOptions
        },
        composer: {
            messageState: {
                isSending: messageState.isSending,
                pendingReply: messageState.pendingReply
            },
            actions: {
                onSwitchSessionDriver: actions.onSwitchSessionDriver,
                isSwitchingSessionDriver: actions.isSwitchingSessionDriver
            },
            allowSendWhenInactive,
            attachmentsSupported: true,
            disabled: messageState.isSending,
            containerRef: composerRef
        }
    }), [
        actions.isSwitchingSessionDriver,
        actions.onSwitchSessionDriver,
        allowSendWhenInactive,
        messageState.isSending,
        messageState.pendingReply,
        props.api,
        runtimeOptions,
        session
    ])

    return (
        <div
            className="session-chat-layout ds-chat-shell flex-1 min-h-0"
            data-chat-keyboard-open={isKeyboardOpen ? 'true' : 'false'}
            data-chat-standalone={isStandalone ? 'true' : 'false'}
            style={chatLayoutStyle}
        >
            <Suspense fallback={<SessionChatWorkspacePendingSurface />}>
                <LazySessionChatRuntimeSurface
                    {...runtimeSurface}
                    persistComposerDraft={persistComposerDraft}
                >
                    <SessionChatLocalNoticeStack notices={localNoticesModel.localNotices} />
                    {memberComposerLocked ? (
                        <MemberReadOnlyComposer session={session} />
                    ) : (
                        <Suspense fallback={<SessionChatWorkspaceComposerFallback />}>
                            <LazySessionChatComposerSurface {...composerSurface} />
                        </Suspense>
                    )}
                </LazySessionChatRuntimeSurface>
            </Suspense>
        </div>
    )
}
