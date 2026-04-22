import { useQueryClient } from '@tanstack/react-query'
import { Outlet, useLocation, useMatchRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { m } from 'motion/react'
import { type JSX, useCallback, useEffect, useRef } from 'react'
import { SessionList } from '@/components/SessionList'
import { SessionsEmptyState } from '@/components/SessionsEmptyState'
import { disposeSessionViewRuntime } from '@/hooks/queries/sessionViewRuntime'
import { useSessions } from '@/hooks/queries/useSessions'
import { useDesktopSessionsLayout } from '@/hooks/useDesktopSessionsLayout'
import { useFinalizeBootShell } from '@/hooks/useFinalizeBootShell'
import { useAppContext } from '@/lib/app-context'
import { getNoticePreset } from '@/lib/noticePresets'
import { writeLastOpenedSessionId } from '@/lib/sessionEntryPreference'
import {
    SESSION_LIST_CREATE_BUTTON_TEST_ID,
    SESSIONS_LIST_PANE_TEST_ID,
    SESSIONS_LIST_SCROLLER_TEST_ID,
} from '@/lib/sessionUiContracts'
import { useTranslation } from '@/lib/use-translation'
import { SessionRouteBanner } from '@/routes/sessions/components/SessionRouteBanner'
import { SessionsMobileCreateButton } from '@/routes/sessions/components/SessionsMobileCreateButton'
import { SessionsShellHeader } from '@/routes/sessions/components/SessionsShellHeader'
import {
    isSessionsIndexPath,
    NEW_SESSION_ROUTE,
    resolveSessionRouteParam,
    SETTINGS_ROUTE,
} from '@/routes/sessions/sessionRoutePaths'
import { loadNewSessionRouteModule, loadSettingsRouteModule } from '@/routes/sessions/sessionRoutePreload'
import { shouldClearSelectedSessionDetail } from '@/routes/sessions/sessionsShellSelectionSupport'
import {
    buildSessionsIndexNavigation,
    getSessionsPaneMotionState,
    runStaticRouteNavigation,
} from '@/routes/sessions/sessionsShellSupport'
import { useSessionsShellActiveSection } from '@/routes/sessions/useSessionsShellActiveSection'
import { useSessionsShellPreloadOwner } from '@/routes/sessions/useSessionsShellPreloadOwner'

const SESSIONS_DETAIL_VIEWPORT_CLASS_NAME = 'sessions-detail-route-transition'
const SESSIONS_LIST_PANE_CLASS_NAME = 'sessions-mobile-list-pane'
const SESSIONS_DETAIL_PANE_CLASS_NAME = 'sessions-mobile-detail-pane'
const SESSIONS_LIST_SCROLLER_CLASS_NAME = 'desktop-scrollbar-stable flex-1 min-h-0 overflow-x-hidden overflow-y-auto'
const SESSIONS_PANE_TRANSITION = {
    duration: 0.42,
    ease: [0.22, 1, 0.36, 1],
} as const

export function SessionsShell(): JSX.Element {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const search = useSearch({ from: '/sessions' })
    const queryClient = useQueryClient()
    const pathname = useLocation({ select: (location) => location.pathname })
    const matchRoute = useMatchRoute()
    const { t } = useTranslation()
    const errorPreset = getNoticePreset('genericError', t)
    const { sessions, error, isLoading: areSessionsLoading } = useSessions(api)

    const sessionMatch = matchRoute({ to: '/sessions/$sessionId', fuzzy: true })
    const selectedSessionId = sessionMatch ? resolveSessionRouteParam(sessionMatch.sessionId) : null
    const isSessionsIndex = isSessionsIndexPath(pathname)
    const isDesktopLayout = useDesktopSessionsLayout()
    const previousRuntimeSessionIdRef = useRef<string | null>(selectedSessionId)
    const {
        activeSectionId,
        handleActiveSectionChange,
        routeSelectionNeedsSectionSync,
        selectedSectionId,
        selectedSession,
        wasSelectedSessionSeen,
    } = useSessionsShellActiveSection({
        searchSection: search.section,
        selectedSessionId,
        sessions,
    })

    useFinalizeBootShell(isSessionsIndex)
    const { handleSelectSession, handleSessionIntent } = useSessionsShellPreloadOwner({
        api,
        navigate,
        queryClient,
        selectedSessionId,
    })

    const handleNewSession = useCallback(() => {
        runStaticRouteNavigation(navigate, NEW_SESSION_ROUTE, loadNewSessionRouteModule())
    }, [navigate])

    const handleOpenSettings = useCallback(() => {
        runStaticRouteNavigation(navigate, SETTINGS_ROUTE, loadSettingsRouteModule())
    }, [navigate])

    useEffect(() => {
        const previousSessionId = previousRuntimeSessionIdRef.current
        if (previousSessionId && previousSessionId !== selectedSessionId) {
            disposeSessionViewRuntime(queryClient, previousSessionId)
        }

        previousRuntimeSessionIdRef.current = selectedSessionId
    }, [queryClient, selectedSessionId])

    useEffect(() => {
        if (!selectedSessionId) {
            return
        }

        writeLastOpenedSessionId(selectedSessionId)
    }, [selectedSessionId])

    useEffect(() => {
        if (areSessionsLoading) {
            return
        }

        if (
            !shouldClearSelectedSessionDetail({
                activeSectionId,
                routeSelectionNeedsSectionSync,
                selectedSectionId,
                selectedSession,
                selectedSessionId,
                sessionsCount: sessions.length,
                wasSelectedSessionSeen,
            })
        ) {
            return
        }

        void navigate(buildSessionsIndexNavigation(activeSectionId))
    }, [
        activeSectionId,
        areSessionsLoading,
        navigate,
        routeSelectionNeedsSectionSync,
        selectedSession,
        selectedSectionId,
        selectedSessionId,
        sessions.length,
    ])

    const paneMotionState = getSessionsPaneMotionState({
        isDesktopLayout,
        isSessionsIndex,
    })

    return (
        <div className="relative flex h-full min-h-0 min-w-0 w-full flex-1 overflow-hidden lg:overflow-visible">
            <m.div
                data-testid={SESSIONS_LIST_PANE_TEST_ID}
                data-sessions-pane="list"
                aria-hidden={!isDesktopLayout && !isSessionsIndex ? 'true' : undefined}
                className={`${SESSIONS_LIST_PANE_CLASS_NAME} ds-sessions-list-pane absolute inset-0 z-10 flex w-full shrink-0 flex-col bg-[var(--app-bg)] lg:relative lg:inset-auto lg:z-auto`}
                animate={paneMotionState.listPaneAnimate}
                transition={SESSIONS_PANE_TRANSITION}
                style={{ pointerEvents: paneMotionState.listPanePointerEvents }}
            >
                <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-px bg-[var(--app-divider)] lg:block" />
                <SessionsShellHeader settingsTitle={t('settings.title')} onOpenSettings={handleOpenSettings} />

                <div data-testid={SESSIONS_LIST_SCROLLER_TEST_ID} className={SESSIONS_LIST_SCROLLER_CLASS_NAME}>
                    {error ? (
                        <div className="mx-auto w-full max-w-content">
                            <SessionRouteBanner tone="error" title={errorPreset.title} description={error} />
                        </div>
                    ) : null}
                    <SessionList
                        activeSectionId={activeSectionId}
                        onActiveSectionChange={handleActiveSectionChange}
                        sessions={sessions}
                        selectedSessionId={selectedSessionId}
                        preferredSectionId={search.section}
                        api={api}
                        actions={{
                            onSelect: handleSelectSession,
                            onSessionIntent: handleSessionIntent,
                            onNewSession: handleNewSession,
                        }}
                    />
                </div>
            </m.div>

            <m.div
                data-testid="sessions-detail-pane"
                data-sessions-pane="detail"
                aria-hidden={!isDesktopLayout && isSessionsIndex ? 'true' : undefined}
                className={`${SESSIONS_DETAIL_PANE_CLASS_NAME} absolute inset-0 z-20 flex min-w-0 w-full flex-1 flex-col bg-transparent lg:relative lg:inset-auto lg:z-auto lg:bg-[var(--app-bg)]`}
                animate={paneMotionState.detailPaneAnimate}
                transition={SESSIONS_PANE_TRANSITION}
                style={{ pointerEvents: paneMotionState.detailPanePointerEvents }}
            >
                <div
                    data-testid="sessions-detail-viewport"
                    className={`${SESSIONS_DETAIL_VIEWPORT_CLASS_NAME} min-h-0 min-w-0 w-full flex-1 overflow-hidden`}
                >
                    <div className="h-full min-h-0 w-full">
                        <Outlet />
                    </div>
                </div>
            </m.div>

            <SessionsMobileCreateButton
                visible={!isDesktopLayout && isSessionsIndex}
                testId={SESSION_LIST_CREATE_BUTTON_TEST_ID}
                title={t('sessions.new')}
                onClick={handleNewSession}
            />
        </div>
    )
}

export function SessionsIndexPage(): JSX.Element {
    const navigate = useNavigate()
    const { api } = useAppContext()
    const { sessions } = useSessions(api)
    const isDesktopLayout = useDesktopSessionsLayout()
    const handleCreate = useCallback(() => {
        runStaticRouteNavigation(navigate, NEW_SESSION_ROUTE, loadNewSessionRouteModule())
    }, [navigate])
    const handleOpenSettings = useCallback(() => {
        runStaticRouteNavigation(navigate, SETTINGS_ROUTE, loadSettingsRouteModule())
    }, [navigate])

    if (!isDesktopLayout && sessions.length > 0) {
        return <div className="h-full w-full" aria-hidden="true" />
    }

    return (
        <div className="flex h-full min-h-0 min-w-0 w-full flex-1">
            <SessionsEmptyState
                hasSessions={sessions.length > 0}
                onCreate={handleCreate}
                onOpenSettings={handleOpenSettings}
            />
        </div>
    )
}
