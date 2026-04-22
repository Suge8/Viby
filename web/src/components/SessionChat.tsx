import type { SameSessionSwitchTargetDriver } from '@viby/protocol'
import { useCallback, useMemo, useRef } from 'react'
import { MotionStaggerGroup, MotionStaggerItem } from '@/components/motion/motionPrimitives'
import SessionChatWorkspace from '@/components/SessionChatWorkspace'
import { SessionHeader } from '@/components/SessionHeader'
import { buildSessionChatPageStyle } from '@/components/sessionChatLayoutStyle'
import type { SessionChatWorkspaceProps } from '@/components/sessionChatWorkspaceTypes'
import { useSessionActions } from '@/hooks/mutations/useSessionActions'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import { useElementHeight } from '@/hooks/useElementHeight'
import { SESSION_CHAT_PAGE_TEST_ID } from '@/lib/sessionUiContracts'

type SessionChatRouteWorkspace = Pick<
    SessionChatWorkspaceProps,
    'api' | 'session' | 'messageState' | 'runtimeOptions' | 'persistComposerDraft'
>

type SessionChatRouteActions = Pick<
    SessionChatWorkspaceProps['actions'],
    'onAtBottomChange' | 'onFlushPending' | 'onLoadHistoryUntilPreviousUser' | 'onRefresh' | 'onRetryMessage' | 'onSend'
>

type SessionChatProps = {
    workspace: SessionChatRouteWorkspace
    actions: SessionChatRouteActions
    onBack: () => void
    onSuggestionAction: (suggestion: Suggestion) => void
    onViewFiles?: () => void
    onViewTerminal?: () => void
}

export function SessionChat(props: SessionChatProps): React.JSX.Element {
    const { actions, onBack, onSuggestionAction, onViewFiles, onViewTerminal, workspace } = props
    const { api, messageState, runtimeOptions, session } = workspace
    const headerStageRef = useRef<HTMLDivElement | null>(null)
    const headerHeight = useElementHeight(headerStageRef)
    const { abortSession, switchSessionDriver, isSwitchingSessionDriver } = useSessionActions(api, session, {
        liveConfigSupport: runtimeOptions.liveConfigSupport,
    })

    const handleAbort = useCallback(async () => {
        await abortSession()
    }, [abortSession])

    const handleSwitchSessionDriver = useCallback(
        async (targetDriver: SameSessionSwitchTargetDriver) => {
            await switchSessionDriver(targetDriver)
        },
        [switchSessionDriver]
    )

    const headerNavigation = useMemo(
        () => ({
            onBack,
            onViewFiles: session.metadata?.path ? onViewFiles : undefined,
            onViewTerminal: session.active ? onViewTerminal : undefined,
        }),
        [onBack, onViewFiles, onViewTerminal, session.active, session.metadata?.path]
    )

    const workspaceActions = useMemo(
        () => ({
            ...actions,
            onAbort: handleAbort,
            onSwitchSessionDriver: handleSwitchSessionDriver,
            isSwitchingSessionDriver,
        }),
        [actions, handleAbort, handleSwitchSessionDriver, isSwitchingSessionDriver]
    )

    const workspaceRuntimeOptions = useMemo(
        () => ({
            ...runtimeOptions,
            onSuggestionAction,
        }),
        [onSuggestionAction, runtimeOptions]
    )
    const pageStyle = useMemo(() => buildSessionChatPageStyle({ headerHeight }), [headerHeight])

    return (
        <MotionStaggerGroup
            key={session.id}
            testId={SESSION_CHAT_PAGE_TEST_ID}
            className="session-chat-page relative flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden bg-[var(--app-bg)]"
            style={pageStyle}
            delay={0.02}
            stagger={0.09}
        >
            <MotionStaggerItem
                className="pointer-events-none absolute inset-x-0 top-0 z-[var(--ds-session-chat-header-layer)]"
                y={-18}
            >
                <SessionHeader session={session} navigation={headerNavigation} stageRef={headerStageRef} />
            </MotionStaggerItem>

            <div className="session-chat-page-body min-h-0 flex-1 overflow-hidden">
                <SessionChatWorkspace
                    api={api}
                    session={session}
                    messageState={messageState}
                    actions={workspaceActions}
                    runtimeOptions={workspaceRuntimeOptions}
                    persistComposerDraft={workspace.persistComposerDraft}
                />
            </div>
        </MotionStaggerGroup>
    )
}
