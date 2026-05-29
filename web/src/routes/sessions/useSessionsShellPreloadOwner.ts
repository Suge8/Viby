import type { QueryClient } from '@tanstack/react-query'
import type { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiClient } from '@/api/client'
import { runPreloadedNavigation } from '@/lib/navigationTransition'
import {
    preloadSessionDetailCriticalRoute,
    preloadSessionDetailIntent,
    warmSessionDetailAncillaryRouteData,
} from '@/routes/sessions/sessionDetailRoutePreload'
import { AGENTS_ROUTE, buildSessionHref, NEW_SESSION_ROUTE, SETTINGS_ROUTE } from '@/routes/sessions/sessionRoutePaths'
import {
    loadAgentConfigRouteModule,
    loadNewSessionRouteModule,
    loadSettingsRouteModule,
    SESSIONS_IDLE_PRELOADERS,
} from '@/routes/sessions/sessionRoutePreload'
import {
    buildSessionDetailReadyPreloadOptions,
    createSessionIntentRecord,
    isSelectedSession,
    type SessionIntentSource,
    scheduleIdleTask,
    shouldDispatchSessionIntent,
    shouldRunIdleSessionPreload,
} from '@/routes/sessions/sessionsShellSupport'

type Navigate = ReturnType<typeof useNavigate>

type UseSessionsShellPreloadOwnerOptions = {
    api: ApiClient | null
    navigate: Navigate
    pathname: string
    queryClient: QueryClient
    routeVisitRevision: number
    selectedSessionId: string | null
}

export type SessionsShellStaticRouteId = 'agents' | 'new' | 'settings'

type PendingNavigationTarget =
    | { type: 'session'; sessionId: string }
    | { type: 'static'; routeId: SessionsShellStaticRouteId }
    | null

type StaticRouteTarget = {
    preload: () => Promise<unknown>
    route: typeof AGENTS_ROUTE | typeof NEW_SESSION_ROUTE | typeof SETTINGS_ROUTE
}

type UseSessionsShellPreloadOwnerResult = {
    handleSelectSession: (sessionId: string) => void
    handleSessionIntent: (sessionId: string, source: SessionIntentSource) => void
    handleStaticRouteNavigation: (routeId: SessionsShellStaticRouteId) => void
    openingSessionId: string | null
    pendingStaticRouteId: SessionsShellStaticRouteId | null
}

const STATIC_ROUTE_TARGETS: Record<SessionsShellStaticRouteId, StaticRouteTarget> = {
    agents: { preload: loadAgentConfigRouteModule, route: AGENTS_ROUTE },
    new: { preload: loadNewSessionRouteModule, route: NEW_SESSION_ROUTE },
    settings: { preload: loadSettingsRouteModule, route: SETTINGS_ROUTE },
}

function buildSessionDetailIntentOptions(options: {
    api: ApiClient | null
    queryClient: QueryClient
    sessionId: string
}): {
    api: ApiClient | null
    queryClient: QueryClient
    recoveryHref: string
    sessionId: string
} {
    return {
        api: options.api,
        queryClient: options.queryClient,
        recoveryHref: buildSessionHref(options.sessionId),
        sessionId: options.sessionId,
    }
}

function preloadSelectedSession(options: {
    api: ApiClient | null
    queryClient: QueryClient
    sessionId: string
}): Promise<void> {
    const preloadOptions = buildSessionDetailReadyPreloadOptions(options)
    warmSessionDetailAncillaryRouteData(preloadOptions)
    return preloadSessionDetailCriticalRoute(preloadOptions)
}

export function shouldClearPendingNavigation(options: {
    pathname: string
    pendingTarget: PendingNavigationTarget
    pendingRouteVisitRevision: number | null
    routeVisitRevision: number
    selectedSessionChanged: boolean
    selectedSessionId: string | null
}): boolean {
    if (!options.pendingTarget) {
        return false
    }

    if (hasReachedPendingTarget(options.pendingTarget, options.pathname, options.selectedSessionId)) {
        return true
    }

    return options.selectedSessionChanged || options.pendingRouteVisitRevision !== options.routeVisitRevision
}

function hasReachedPendingTarget(
    target: Exclude<PendingNavigationTarget, null>,
    pathname: string,
    selectedSessionId: string | null
): boolean {
    if (target.type === 'session') {
        return target.sessionId === selectedSessionId || pathname === buildSessionHref(target.sessionId)
    }

    return pathname === STATIC_ROUTE_TARGETS[target.routeId].route
}

function getPendingSessionId(target: PendingNavigationTarget): string | null {
    return target?.type === 'session' ? target.sessionId : null
}

function getPendingStaticRouteId(target: PendingNavigationTarget): SessionsShellStaticRouteId | null {
    return target?.type === 'static' ? target.routeId : null
}

export function useSessionsShellPreloadOwner(
    options: UseSessionsShellPreloadOwnerOptions
): UseSessionsShellPreloadOwnerResult {
    const lastSessionIntentRef = useRef<ReturnType<typeof createSessionIntentRecord> | null>(null)
    const [pendingTarget, setPendingTargetState] = useState<PendingNavigationTarget>(null)
    const pendingTargetRef = useRef<PendingNavigationTarget>(null)
    const pendingTokenRef = useRef<symbol | null>(null)
    const pendingRouteVisitRevisionRef = useRef<number | null>(null)
    const previousSelectedSessionIdRef = useRef<string | null>(options.selectedSessionId)

    const setPendingTarget = useCallback((target: PendingNavigationTarget, token: symbol): void => {
        pendingTargetRef.current = target
        pendingTokenRef.current = token
        setPendingTargetState(target)
    }, [])

    const clearPendingNavigation = useCallback((): void => {
        pendingTargetRef.current = null
        pendingTokenRef.current = null
        pendingRouteVisitRevisionRef.current = null
        setPendingTargetState(null)
    }, [])

    const clearPendingNavigationIfCurrent = useCallback(
        (token: symbol): void => {
            if (pendingTokenRef.current === token) {
                clearPendingNavigation()
            }
        },
        [clearPendingNavigation]
    )

    const handleSessionIntent = useCallback(
        (sessionId: string, source: SessionIntentSource): void => {
            if (
                !shouldDispatchSessionIntent({
                    lastIntent: lastSessionIntentRef.current,
                    selectedSessionId: options.selectedSessionId,
                    sessionId,
                    source,
                })
            ) {
                return
            }

            lastSessionIntentRef.current = createSessionIntentRecord({ sessionId, source })
            preloadSessionDetailIntent(
                buildSessionDetailIntentOptions({
                    api: options.api,
                    queryClient: options.queryClient,
                    sessionId,
                })
            )
        },
        [options.api, options.queryClient, options.selectedSessionId]
    )

    const handleSelectSession = useCallback(
        (sessionId: string): void => {
            if (
                isSelectedSession(options.selectedSessionId, sessionId) ||
                getPendingSessionId(pendingTargetRef.current) === sessionId
            ) {
                return
            }

            const token = Symbol('session-pending-navigation')
            pendingRouteVisitRevisionRef.current = options.routeVisitRevision
            setPendingTarget({ type: 'session', sessionId }, token)

            void runPreloadedNavigation(
                () =>
                    preloadSelectedSession({
                        api: options.api,
                        queryClient: options.queryClient,
                        sessionId,
                    }),
                () => {
                    if (pendingTokenRef.current !== token) {
                        return
                    }

                    void options.navigate({
                        to: '/sessions/$sessionId',
                        params: { sessionId },
                        search: {},
                    })
                },
                buildSessionHref(sessionId)
            ).then(
                (committed) => {
                    if (!committed) {
                        clearPendingNavigationIfCurrent(token)
                    }
                },
                () => clearPendingNavigationIfCurrent(token)
            )
        },
        [
            clearPendingNavigationIfCurrent,
            options.api,
            options.navigate,
            options.queryClient,
            options.routeVisitRevision,
            options.selectedSessionId,
            setPendingTarget,
        ]
    )

    const handleStaticRouteNavigation = useCallback(
        (routeId: SessionsShellStaticRouteId): void => {
            if (getPendingStaticRouteId(pendingTargetRef.current) === routeId) {
                return
            }

            const target = STATIC_ROUTE_TARGETS[routeId]
            if (options.pathname === target.route) {
                return
            }

            const token = Symbol('static-route-pending-navigation')
            pendingRouteVisitRevisionRef.current = options.routeVisitRevision
            setPendingTarget({ type: 'static', routeId }, token)

            void runPreloadedNavigation(
                target.preload(),
                () => {
                    if (pendingTokenRef.current !== token) {
                        return
                    }

                    void options.navigate({ to: target.route })
                },
                target.route
            ).then(
                (committed) => {
                    if (!committed) {
                        clearPendingNavigationIfCurrent(token)
                    }
                },
                () => clearPendingNavigationIfCurrent(token)
            )
        },
        [
            clearPendingNavigationIfCurrent,
            options.navigate,
            options.pathname,
            options.routeVisitRevision,
            setPendingTarget,
        ]
    )

    useEffect(() => {
        const selectedSessionChanged = previousSelectedSessionIdRef.current !== options.selectedSessionId
        previousSelectedSessionIdRef.current = options.selectedSessionId
        if (
            shouldClearPendingNavigation({
                pathname: options.pathname,
                pendingTarget,
                pendingRouteVisitRevision: pendingRouteVisitRevisionRef.current,
                routeVisitRevision: options.routeVisitRevision,
                selectedSessionChanged,
                selectedSessionId: options.selectedSessionId,
            })
        ) {
            clearPendingNavigation()
        }
    }, [clearPendingNavigation, pendingTarget, options.pathname, options.routeVisitRevision, options.selectedSessionId])

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

    return {
        handleSelectSession,
        handleSessionIntent,
        handleStaticRouteNavigation,
        openingSessionId: getPendingSessionId(pendingTarget),
        pendingStaticRouteId: getPendingStaticRouteId(pendingTarget),
    }
}
