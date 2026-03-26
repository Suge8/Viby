import { useCallback, useEffect, useRef, type JSX } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Outlet, useLocation, useMatchRoute, useNavigate } from '@tanstack/react-router'
import { SessionList } from '@/components/SessionList'
import { SessionsEmptyState } from '@/components/SessionsEmptyState'
import { getLikelyNextSessionId } from '@/components/session-list/sessionListUtils'
import { useFinalizeBootShell } from '@/hooks/useFinalizeBootShell'
import { disposeSessionViewRuntime } from '@/hooks/queries/sessionViewRuntime'
import { useSessions } from '@/hooks/queries/useSessions'
import { useAppContext } from '@/lib/app-context'
import {
    runPreloadedNavigation,
} from '@/lib/navigationTransition'
import {
    SESSIONS_IDLE_PRELOAD_DELAY_MS,
    getNetworkInformation,
    shouldPreloadIdleSessionRoutes,
} from '@/lib/networkPreloadPolicy'
import { getNoticePreset } from '@/lib/noticePresets'
import { readLastOpenedSessionId, writeLastOpenedSessionId } from '@/lib/sessionEntryPreference'
import { useTranslation } from '@/lib/use-translation'
import { SessionsShellHeader } from '@/routes/sessions/components/SessionsShellHeader'
import { SessionRouteBanner } from '@/routes/sessions/components/SessionRouteBanner'
import {
    SESSIONS_IDLE_PRELOADERS,
    loadNewSessionRouteModule,
    loadSettingsRouteModule,
} from '@/routes/sessions/sessionRoutePreload'
import {
    preloadSessionDetailCriticalRoute,
    preloadSessionDetailIntent,
    preloadSessionDetailRoute,
    warmSessionDetailRouteData
} from '@/routes/sessions/sessionDetailRoutePreload'

const SESSIONS_DETAIL_VIEWPORT_CLASS_NAME = 'sessions-detail-route-transition'
const SESSIONS_LIST_PANE_CLASS_NAME = 'sessions-mobile-list-pane'
const SESSIONS_DETAIL_PANE_CLASS_NAME = 'sessions-mobile-detail-pane'
const SESSIONS_INDEX_ROUTE = '/sessions'
const NEW_SESSION_ROUTE = '/sessions/new'
const SETTINGS_ROUTE = '/settings'
const EXPLICIT_SESSION_DETAIL_PRELOAD_OPTIONS = {
    includeLatestMessages: true
} as const
const IDLE_SESSION_DETAIL_PRELOAD_OPTIONS = {
    includeLatestMessages: false
} as const

type IdleTask = () => void

function buildSessionHref(sessionId: string): string {
    return `/sessions/${sessionId}`
}

function isSelectedSession(
    selectedSessionId: string | null,
    sessionId: string
): boolean {
    return selectedSessionId === sessionId
}

function shouldRunIdleSessionPreload(): boolean {
    return shouldPreloadIdleSessionRoutes(getNetworkInformation())
}

function scheduleIdleTask(task: IdleTask): (() => void) | undefined {
    if (typeof window === 'undefined') {
        return undefined
    }

    if ('requestIdleCallback' in window) {
        const idleId = window.requestIdleCallback(task)
        return () => window.cancelIdleCallback(idleId)
    }

    const timeoutId = globalThis.setTimeout(task, SESSIONS_IDLE_PRELOAD_DELAY_MS)
    return () => globalThis.clearTimeout(timeoutId)
}

function runStaticRouteNavigation(
    navigate: ReturnType<typeof useNavigate>,
    route: typeof NEW_SESSION_ROUTE | typeof SETTINGS_ROUTE,
    preload: Promise<unknown>
): void {
    runPreloadedNavigation(preload, () => {
        void navigate({ to: route })
    }, route)
}

export function SessionsShell(): JSX.Element {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const pathname = useLocation({ select: location => location.pathname })
    const matchRoute = useMatchRoute()
    const { t } = useTranslation()
    const errorPreset = getNoticePreset('genericError', t)
    const { sessions, error } = useSessions(api)

    const sessionMatch = matchRoute({ to: '/sessions/$sessionId', fuzzy: true })
    const selectedSessionId = sessionMatch && sessionMatch.sessionId !== 'new' ? sessionMatch.sessionId : null
    const isSessionsIndex = pathname === '/sessions' || pathname === '/sessions/'
    const previousSessionIdRef = useRef<string | null>(selectedSessionId)
    const idleWarmedSessionIdRef = useRef<string | null>(selectedSessionId)

    useFinalizeBootShell(isSessionsIndex)

    const preloadSessionSelectionCritical = useCallback((sessionId: string): Promise<void> => {
        return preloadSessionDetailCriticalRoute({
            api,
            queryClient,
            sessionId
        })
    }, [api, queryClient])

    const handlePreloadSession = useCallback((sessionId: string) => {
        if (isSelectedSession(selectedSessionId, sessionId)) {
            return
        }

        void preloadSessionDetailIntent({
            api,
            queryClient,
            sessionId,
            recoveryHref: buildSessionHref(sessionId)
        })
    }, [api, queryClient, selectedSessionId])

    const handleSelectSession = useCallback((sessionId: string) => {
        if (isSelectedSession(selectedSessionId, sessionId)) {
            return
        }

        const recoveryHref = buildSessionHref(sessionId)
        warmSessionDetailRouteData({
            api,
            queryClient,
            sessionId,
            ...EXPLICIT_SESSION_DETAIL_PRELOAD_OPTIONS,
            recoveryHref
        })
        runPreloadedNavigation(() => preloadSessionSelectionCritical(sessionId), () => {
            void navigate({
                to: '/sessions/$sessionId',
                params: { sessionId },
            })
        }, recoveryHref)
    }, [api, navigate, preloadSessionSelectionCritical, queryClient, selectedSessionId])

    const handleArchiveSelectedSession = useCallback((sessionId: string) => {
        if (selectedSessionId !== sessionId) {
            return
        }

        void navigate({
            to: SESSIONS_INDEX_ROUTE,
            replace: true
        })
    }, [navigate, selectedSessionId])

    const handleNewSession = useCallback(() => {
        runStaticRouteNavigation(navigate, NEW_SESSION_ROUTE, loadNewSessionRouteModule())
    }, [navigate])

    const handleOpenSettings = useCallback(() => {
        runStaticRouteNavigation(navigate, SETTINGS_ROUTE, loadSettingsRouteModule())
    }, [navigate])

    useEffect(() => {
        const previousSessionId = previousSessionIdRef.current
        if (previousSessionId && previousSessionId !== selectedSessionId) {
            disposeSessionViewRuntime(queryClient, previousSessionId)
        }
        previousSessionIdRef.current = selectedSessionId
    }, [queryClient, selectedSessionId])

    useEffect(() => {
        if (!selectedSessionId) {
            return
        }
        writeLastOpenedSessionId(selectedSessionId)
    }, [selectedSessionId])

    useEffect(() => {
        return () => {
            const activeSessionId = previousSessionIdRef.current
            if (!activeSessionId) {
                return
            }
            disposeSessionViewRuntime(queryClient, activeSessionId)
        }
    }, [queryClient])

    useEffect(() => {
        return scheduleIdleTask(() => {
            if (!shouldRunIdleSessionPreload()) {
                return
            }

            for (const preload of SESSIONS_IDLE_PRELOADERS) {
                void preload()
            }
        })
    }, [])

    useEffect(() => {
        if (selectedSessionId) {
            idleWarmedSessionIdRef.current = selectedSessionId
            return
        }

        const candidateSessionId = getLikelyNextSessionId(sessions, {
            preferredSessionId: readLastOpenedSessionId()
        })
        if (!candidateSessionId || idleWarmedSessionIdRef.current === candidateSessionId) {
            return
        }

        if (!shouldRunIdleSessionPreload()) {
            return
        }

        return scheduleIdleTask(() => {
            idleWarmedSessionIdRef.current = candidateSessionId
            void preloadSessionDetailRoute({
                api,
                queryClient,
                sessionId: candidateSessionId,
                ...IDLE_SESSION_DETAIL_PRELOAD_OPTIONS
            }).catch(() => {
                if (idleWarmedSessionIdRef.current === candidateSessionId) {
                    idleWarmedSessionIdRef.current = null
                }
            })
        })
    }, [api, queryClient, selectedSessionId, sessions])

    const listPaneVisibilityClassName = isSessionsIndex ? 'flex' : 'hidden lg:flex'
    const detailPaneVisibilityClassName = isSessionsIndex ? 'hidden lg:flex' : 'flex'

    return (
        <div className="flex h-full min-h-0 min-w-0 w-full flex-1">
            <div
                data-testid="sessions-list-pane"
                data-sessions-pane="list"
                className={`${listPaneVisibilityClassName} ${SESSIONS_LIST_PANE_CLASS_NAME} relative w-full lg:w-[420px] xl:w-[480px] shrink-0 flex-col bg-[var(--app-bg)]`}
            >
                <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-px bg-[var(--app-divider)] lg:block" />
                <SessionsShellHeader
                    settingsTitle={t('settings.title')}
                    onOpenSettings={handleOpenSettings}
                />

                <div className="flex-1 min-h-0 overflow-y-auto desktop-scrollbar-left">
                    {error ? (
                        <div className="mx-auto w-full max-w-content">
                            <SessionRouteBanner
                                tone="error"
                                title={errorPreset.title}
                                description={error}
                            />
                        </div>
                    ) : null}
                    <SessionList
                        sessions={sessions}
                        selectedSessionId={selectedSessionId}
                        api={api}
                        actions={{
                            onSelect: handleSelectSession,
                            onPreloadSession: handlePreloadSession,
                            onNewSession: handleNewSession,
                            onArchiveSelectedSession: handleArchiveSelectedSession
                        }}
                    />
                </div>
            </div>

            <div
                data-testid="sessions-detail-pane"
                data-sessions-pane="detail"
                className={`${detailPaneVisibilityClassName} ${SESSIONS_DETAIL_PANE_CLASS_NAME} min-w-0 w-full flex-1 flex-col bg-[var(--app-bg)]`}
            >
                <div
                    data-testid="sessions-detail-viewport"
                    className={`${SESSIONS_DETAIL_VIEWPORT_CLASS_NAME} min-h-0 min-w-0 w-full flex-1 overflow-hidden`}
                >
                    <Outlet />
                </div>
            </div>
        </div>
    )
}

export function SessionsIndexPage(): JSX.Element {
    const navigate = useNavigate()
    const { api } = useAppContext()
    const { sessions } = useSessions(api)
    const handleCreate = useCallback(() => {
        runStaticRouteNavigation(navigate, NEW_SESSION_ROUTE, loadNewSessionRouteModule())
    }, [navigate])
    const handleOpenSettings = useCallback(() => {
        runStaticRouteNavigation(navigate, SETTINGS_ROUTE, loadSettingsRouteModule())
    }, [navigate])

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
