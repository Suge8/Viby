import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useMatchRoute, useNavigate, useRouter, useSearch } from '@tanstack/react-router'
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SessionsEmptyState } from '@/components/SessionsEmptyState'
import { disposeSessionViewRuntime } from '@/hooks/queries/sessionViewRuntime'
import { useSessions } from '@/hooks/queries/useSessions'
import { useDesktopSessionsLayout } from '@/hooks/useDesktopSessionsLayout'
import { useFinalizeBootShell } from '@/hooks/useFinalizeBootShell'
import { useAppContext } from '@/lib/app-context'
import { useNoticeCenter } from '@/lib/notice-center'
import { getNoticePreset } from '@/lib/noticePresets'
import { writeLastOpenedSessionId } from '@/lib/sessionEntryPreference'
import { SESSION_LIST_CREATE_BUTTON_TEST_ID } from '@/lib/sessionUiContracts'
import { useTranslation } from '@/lib/use-translation'
import { useRemotePairingInteractionBlocked } from '@/remote/remotePairingInteractionState'
import { SessionsCreateButton } from '@/routes/sessions/components/SessionsCreateButton'
import { SessionsShellDetailPane, SessionsShellListPane } from '@/routes/sessions/components/SessionsShellPanes'
import { isSessionsIndexPath, resolveSessionRouteParam } from '@/routes/sessions/sessionRoutePaths'
import {
    SessionsShellNavigationProvider,
    useSessionsShellNavigation,
} from '@/routes/sessions/sessionsShellNavigationContext'
import { shouldClearSelectedSessionDetail } from '@/routes/sessions/sessionsShellSelectionSupport'
import {
    buildSessionsIndexNavigation,
    getSessionsPaneMotionState,
    isSessionsBackNavigationAction,
} from '@/routes/sessions/sessionsShellSupport'
import { useSessionsShellActiveSection } from '@/routes/sessions/useSessionsShellActiveSection'
import { useSessionsShellPreloadOwner } from '@/routes/sessions/useSessionsShellPreloadOwner'

export function SessionsShell(): JSX.Element {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const router = useRouter()
    const search = useSearch({ from: '/sessions' })
    const queryClient = useQueryClient()
    const pathname = useLocation({ select: (location) => location.pathname })
    const routeVisitHref = useLocation({ select: (location) => location.href })
    const matchRoute = useMatchRoute()
    const { t } = useTranslation()
    const errorPreset = getNoticePreset('genericError', t)
    const { addToast } = useNoticeCenter()
    const { sessions, error, isLoading: areSessionsLoading } = useSessions(api)
    const remoteInteractionBlocked = useRemotePairingInteractionBlocked()

    const sessionMatch = matchRoute({ to: '/sessions/$sessionId', fuzzy: true })
    const selectedSessionId = sessionMatch ? resolveSessionRouteParam(sessionMatch.sessionId) : null
    const isSessionsIndex = isSessionsIndexPath(pathname)
    const isDesktopLayout = useDesktopSessionsLayout()
    const previousRuntimeSessionIdRef = useRef<string | null>(selectedSessionId)
    const lastErrorToastRef = useRef<string | null>(null)
    const [isBackNavigation, setIsBackNavigation] = useState(false)
    const [routeVisitRevision, setRouteVisitRevision] = useState(0)
    const lastRouteVisitHrefRef = useRef(routeVisitHref)
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
    const {
        handleSelectSession,
        handleSessionIntent,
        handleStaticRouteNavigation,
        openingSessionId,
        pendingStaticRouteId,
    } = useSessionsShellPreloadOwner({
        api,
        navigate,
        pathname,
        queryClient,
        routeVisitRevision,
        selectedSessionId,
    })

    const navigationContext = useMemo(
        () => ({
            onOpenStaticRoute: handleStaticRouteNavigation,
            pendingStaticRouteId,
        }),
        [handleStaticRouteNavigation, pendingStaticRouteId]
    )

    const handleSessionListActiveSectionChange = useCallback(
        (sectionId: 'running' | 'history') => {
            handleActiveSectionChange(sectionId)
        },
        [handleActiveSectionChange]
    )

    useEffect(() => {
        lastRouteVisitHrefRef.current = routeVisitHref
    }, [routeVisitHref])

    useEffect(() => {
        return router.history.subscribe(({ action, location }) => {
            setIsBackNavigation(isSessionsBackNavigationAction(action))
            if (lastRouteVisitHrefRef.current === location.href) {
                return
            }

            lastRouteVisitHrefRef.current = location.href
            setRouteVisitRevision((revision) => revision + 1)
        })
    }, [router])

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
        if (!error) {
            lastErrorToastRef.current = null
            return
        }
        if (remoteInteractionBlocked || lastErrorToastRef.current === error) {
            lastErrorToastRef.current = error
            return
        }
        lastErrorToastRef.current = error
        addToast({ tone: errorPreset.tone, title: errorPreset.title, description: error })
    }, [addToast, error, errorPreset.title, errorPreset.tone, remoteInteractionBlocked])

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
        skipPaneTransition: !isDesktopLayout && isSessionsIndex && isBackNavigation,
    })

    return (
        <SessionsShellNavigationProvider value={navigationContext}>
            <div className="ds-native-sessions-shell relative flex h-full min-h-0 min-w-0 w-full flex-1 overflow-hidden lg:overflow-visible">
                <SessionsShellListPane
                    activeSectionId={activeSectionId}
                    agentsPending={pendingStaticRouteId === 'agents'}
                    agentsTitle={t('agents.config.title')}
                    api={api}
                    isDesktopLayout={isDesktopLayout}
                    isSessionsIndex={isSessionsIndex}
                    isSessionsLoading={areSessionsLoading}
                    onActiveSectionChange={handleSessionListActiveSectionChange}
                    onOpenStaticRoute={handleStaticRouteNavigation}
                    onSelectSession={handleSelectSession}
                    onSessionIntent={handleSessionIntent}
                    openingSessionId={openingSessionId}
                    paneMotionState={paneMotionState}
                    preferredSectionId={search.section}
                    selectedSessionId={selectedSessionId}
                    sessions={sessions}
                    settingsPending={pendingStaticRouteId === 'settings'}
                    settingsTitle={t('settings.title')}
                />

                <SessionsShellDetailPane
                    isDesktopLayout={isDesktopLayout}
                    isSessionsIndex={isSessionsIndex}
                    paneMotionState={paneMotionState}
                />

                <SessionsCreateButton
                    visible={isDesktopLayout || isSessionsIndex}
                    testId={SESSION_LIST_CREATE_BUTTON_TEST_ID}
                    pending={pendingStaticRouteId === 'new'}
                    title={t('sessions.new')}
                    onClick={() => handleStaticRouteNavigation('new')}
                />
            </div>
        </SessionsShellNavigationProvider>
    )
}

export function SessionsIndexPage(): JSX.Element {
    const { api } = useAppContext()
    const { sessions } = useSessions(api)
    const isDesktopLayout = useDesktopSessionsLayout()
    const { onOpenStaticRoute, pendingStaticRouteId } = useSessionsShellNavigation()
    const handleCreate = useCallback(() => {
        onOpenStaticRoute('new')
    }, [onOpenStaticRoute])
    const handleOpenSettings = useCallback(() => {
        onOpenStaticRoute('settings')
    }, [onOpenStaticRoute])

    if (!isDesktopLayout && sessions.length > 0) {
        return <div className="h-full w-full" aria-hidden="true" />
    }

    return (
        <div className="flex h-full min-h-0 min-w-0 w-full flex-1">
            <SessionsEmptyState
                createPending={pendingStaticRouteId === 'new'}
                hasSessions={sessions.length > 0}
                onCreate={handleCreate}
                onOpenSettings={handleOpenSettings}
                settingsPending={pendingStaticRouteId === 'settings'}
            />
        </div>
    )
}
