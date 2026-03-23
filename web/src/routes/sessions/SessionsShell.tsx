import { useCallback, useEffect, useMemo, useRef, type JSX } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Outlet, useLocation, useMatchRoute, useNavigate } from '@tanstack/react-router'
import { SessionList } from '@/components/SessionList'
import { SessionsEmptyState } from '@/components/SessionsEmptyState'
import { PlusIcon, SettingsIcon, BrandIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { disposeSessionViewRuntime } from '@/hooks/queries/sessionScopedQueryOptions'
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
import { useTranslation } from '@/lib/use-translation'
import { SessionRouteBanner } from '@/routes/sessions/components/SessionRouteBanner'
import {
    loadNewSessionRouteModule,
    loadSettingsRouteModule,
    preloadSessionDetailIntent,
    preloadSessionDetailRoute
} from '@/routes/sessions/sessionRoutePreload'

const SESSIONS_DETAIL_VIEWPORT_CLASS_NAME = 'sessions-detail-route-transition'

type SessionsShellProps = {
    preloaders: ReadonlyArray<() => Promise<unknown>>
}

export function SessionsShell(props: SessionsShellProps): JSX.Element {
    const { api } = useAppContext()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const pathname = useLocation({ select: location => location.pathname })
    const matchRoute = useMatchRoute()
    const { t } = useTranslation()
    const errorPreset = getNoticePreset('genericError', t)
    const { sessions, error } = useSessions(api)

    const archivedCount = useMemo(
        () => sessions.filter((session) => session.lifecycleState === 'archived').length,
        [sessions]
    )
    const openCount = sessions.length - archivedCount
    const sessionMatch = matchRoute({ to: '/sessions/$sessionId', fuzzy: true })
    const selectedSessionId = sessionMatch && sessionMatch.sessionId !== 'new' ? sessionMatch.sessionId : null
    const isSessionsIndex = pathname === '/sessions' || pathname === '/sessions/'
    const previousSessionIdRef = useRef<string | null>(selectedSessionId)

    const preloadSession = useCallback((sessionId: string): Promise<void> => {
        return preloadSessionDetailRoute({
            api,
            queryClient,
            sessionId,
            includeWorkspace: true,
            includeLatestMessages: true
        })
    }, [api, queryClient])

    const handlePreloadSession = useCallback((sessionId: string) => {
        preloadSessionDetailIntent({
            api,
            queryClient,
            sessionId,
            recoveryHref: `/sessions/${sessionId}`
        })
    }, [api, queryClient])

    const handleSelectSession = useCallback((sessionId: string) => {
        const recoveryHref = `/sessions/${sessionId}`
        runPreloadedNavigation(() => preloadSession(sessionId), () => {
            void navigate({
                to: '/sessions/$sessionId',
                params: { sessionId },
            })
        }, recoveryHref)
    }, [navigate, preloadSession])

    const handleNewSession = useCallback(() => {
        runPreloadedNavigation(loadNewSessionRouteModule(), () => {
            void navigate({ to: '/sessions/new' })
        }, '/sessions/new')
    }, [navigate])

    const handleOpenSettings = useCallback(() => {
        runPreloadedNavigation(loadSettingsRouteModule(), () => {
            void navigate({ to: '/settings' })
        }, '/settings')
    }, [navigate])

    useEffect(() => {
        const previousSessionId = previousSessionIdRef.current
        if (previousSessionId && previousSessionId !== selectedSessionId) {
            disposeSessionViewRuntime(queryClient, previousSessionId)
        }
        previousSessionIdRef.current = selectedSessionId
    }, [queryClient, selectedSessionId])

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
        const preloadRoutes = () => {
            if (!shouldPreloadIdleSessionRoutes(getNetworkInformation())) {
                return
            }

            for (const preload of props.preloaders) {
                void preload()
            }
        }

        if (typeof window === 'undefined') {
            return
        }

        if ('requestIdleCallback' in window) {
            const idleId = window.requestIdleCallback(preloadRoutes)
            return () => window.cancelIdleCallback(idleId)
        }

        const timeoutId = globalThis.setTimeout(preloadRoutes, SESSIONS_IDLE_PRELOAD_DELAY_MS)
        return () => globalThis.clearTimeout(timeoutId)
    }, [props.preloaders])

    return (
        <div className="flex h-full min-h-0 min-w-0 w-full flex-1">
            <div
                className={`${isSessionsIndex ? 'flex' : 'hidden lg:flex'} relative w-full lg:w-[420px] xl:w-[480px] shrink-0 flex-col bg-[var(--app-bg)]`}
            >
                <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-px bg-[var(--app-divider)] lg:block" />
                <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                    <div className="mx-auto flex w-full max-w-content items-center justify-between px-3 py-2">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <BrandIcon className="h-5 w-5 text-[var(--ds-accent-lime)]" />
                                <span className="text-base font-semibold tracking-[-0.04em] text-[var(--ds-text-primary)]">
                                    Viby
                                </span>
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--app-hint)]">
                                <span>{t('sessions.summary', { open: openCount, archived: archivedCount })}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                size="icon"
                                variant="secondary"
                                onClick={handleOpenSettings}
                                className="h-11 w-11 text-[var(--app-hint)] hover:text-[var(--app-fg)]"
                                title={t('settings.title')}
                            >
                                <SettingsIcon className="h-5 w-5 text-[var(--ds-accent-coral)]" />
                            </Button>
                            <Button
                                type="button"
                                size="icon"
                                variant="secondary"
                                onClick={handleNewSession}
                                className="session-list-new-button h-11 w-11 text-[var(--app-link)] hover:text-[var(--ds-text-primary)]"
                                title={t('sessions.new')}
                            >
                                <PlusIcon className="h-5 w-5 text-[var(--ds-accent-lime)]" />
                            </Button>
                        </div>
                    </div>
                </div>

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
                        renderHeader={false}
                        api={api}
                        actions={{
                            onSelect: handleSelectSession,
                            onPreloadSession: handlePreloadSession,
                            onNewSession: handleNewSession
                        }}
                    />
                </div>
            </div>

            <div className={`${isSessionsIndex ? 'hidden lg:flex' : 'flex'} min-w-0 w-full flex-1 flex-col bg-[var(--app-bg)]`}>
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
        runPreloadedNavigation(loadNewSessionRouteModule(), () => {
            void navigate({ to: '/sessions/new' })
        }, '/sessions/new')
    }, [navigate])
    const handleOpenSettings = useCallback(() => {
        runPreloadedNavigation(loadSettingsRouteModule(), () => {
            void navigate({ to: '/settings' })
        }, '/settings')
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
