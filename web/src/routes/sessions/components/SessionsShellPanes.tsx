import { Outlet } from '@tanstack/react-router'
import { m } from 'motion/react'
import type { ApiClient } from '@/api/client'
import { SessionList } from '@/components/SessionList'
import type { SessionListSectionId } from '@/components/session-list/sessionListUtils'
import { SESSIONS_LIST_PANE_TEST_ID, SESSIONS_LIST_SCROLLER_TEST_ID } from '@/lib/sessionUiContracts'
import { SessionsShellHeader } from '@/routes/sessions/components/SessionsShellHeader'
import type { SessionIntentSource, SessionsPaneMotionState } from '@/routes/sessions/sessionsShellSupport'
import type { SessionsShellStaticRouteId } from '@/routes/sessions/useSessionsShellPreloadOwner'
import type { SessionSummary } from '@/types/api'

const DETAIL_VIEWPORT_CLASS_NAME = 'sessions-detail-route-transition'
const LIST_PANE_CLASS_NAME = 'sessions-mobile-list-pane'
const DETAIL_PANE_CLASS_NAME = 'sessions-mobile-detail-pane'
const LIST_SCROLLER_CLASS_NAME =
    'ds-sessions-list-scroller desktop-scrollbar-stable flex-1 min-h-0 overflow-x-hidden overflow-y-auto'

type SessionsShellListPaneProps = {
    activeSectionId: SessionListSectionId
    agentsPending: boolean
    agentsTitle: string
    api: ApiClient | null
    isDesktopLayout: boolean
    isSessionsIndex: boolean
    isSessionsLoading: boolean
    onActiveSectionChange: (sectionId: SessionListSectionId) => void
    onOpenStaticRoute: (routeId: SessionsShellStaticRouteId) => void
    onSelectSession: (sessionId: string) => void
    onSessionIntent?: (sessionId: string, source: SessionIntentSource) => void
    openingSessionId: string | null
    paneMotionState: SessionsPaneMotionState
    preferredSectionId?: SessionListSectionId
    selectedSessionId: string | null
    sessions: readonly SessionSummary[]
    settingsPending: boolean
    settingsTitle: string
}

type SessionsShellDetailPaneProps = {
    isDesktopLayout: boolean
    isSessionsIndex: boolean
    paneMotionState: SessionsPaneMotionState
}

export function SessionsShellListPane(props: SessionsShellListPaneProps): React.JSX.Element {
    return (
        <m.div
            data-testid={SESSIONS_LIST_PANE_TEST_ID}
            data-sessions-pane="list"
            aria-hidden={!props.isDesktopLayout && !props.isSessionsIndex ? 'true' : undefined}
            className={`${LIST_PANE_CLASS_NAME} ds-sessions-list-pane absolute inset-0 z-10 flex w-full shrink-0 flex-col bg-[var(--app-bg)] lg:relative lg:inset-auto lg:z-auto`}
            animate={props.paneMotionState.listPaneAnimate}
            transition={props.paneMotionState.paneTransition}
            style={{ pointerEvents: props.paneMotionState.listPanePointerEvents }}
        >
            <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-px bg-[var(--app-divider)] lg:block" />
            <SessionsShellHeader
                agentsTitle={props.agentsTitle}
                settingsTitle={props.settingsTitle}
                agentsPending={props.agentsPending}
                settingsPending={props.settingsPending}
                onOpenAgents={() => props.onOpenStaticRoute('agents')}
                onOpenSettings={() => props.onOpenStaticRoute('settings')}
            />

            <div data-testid={SESSIONS_LIST_SCROLLER_TEST_ID} className={LIST_SCROLLER_CLASS_NAME}>
                <SessionList
                    activeSectionId={props.activeSectionId}
                    isLoading={props.isSessionsLoading}
                    onActiveSectionChange={props.onActiveSectionChange}
                    sessions={props.sessions}
                    openingSessionId={props.openingSessionId}
                    selectedSessionId={props.selectedSessionId}
                    preferredSectionId={props.preferredSectionId}
                    api={props.api}
                    actions={{
                        onSelect: props.onSelectSession,
                        onSessionIntent: props.onSessionIntent,
                    }}
                />
            </div>
        </m.div>
    )
}

export function SessionsShellDetailPane(props: SessionsShellDetailPaneProps): React.JSX.Element {
    return (
        <m.div
            data-testid="sessions-detail-pane"
            data-sessions-pane="detail"
            aria-hidden={!props.isDesktopLayout && props.isSessionsIndex ? 'true' : undefined}
            className={`${DETAIL_PANE_CLASS_NAME} ds-sessions-detail-pane absolute inset-0 z-20 flex min-w-0 w-full flex-1 flex-col bg-transparent lg:relative lg:inset-auto lg:z-auto lg:bg-[var(--app-bg)]`}
            animate={props.paneMotionState.detailPaneAnimate}
            transition={props.paneMotionState.paneTransition}
            style={{ pointerEvents: props.paneMotionState.detailPanePointerEvents }}
        >
            <div
                data-testid="sessions-detail-viewport"
                className={`${DETAIL_VIEWPORT_CLASS_NAME} min-h-0 min-w-0 w-full flex-1 overflow-hidden`}
            >
                <div className="h-full min-h-0 w-full">
                    <Outlet />
                </div>
            </div>
        </m.div>
    )
}
