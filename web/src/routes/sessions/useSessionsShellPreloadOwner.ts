import type { QueryClient } from '@tanstack/react-query'
import type { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef } from 'react'
import type { ApiClient } from '@/api/client'
import { runPreloadedNavigation } from '@/lib/navigationTransition'
import {
    preloadSessionDetailCriticalRoute,
    preloadSessionDetailIntent,
    warmSessionDetailAncillaryRouteData,
} from '@/routes/sessions/sessionDetailRoutePreload'
import { buildSessionHref } from '@/routes/sessions/sessionRoutePaths'
import { SESSIONS_IDLE_PRELOADERS } from '@/routes/sessions/sessionRoutePreload'
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
    queryClient: QueryClient
    selectedSessionId: string | null
}

type UseSessionsShellPreloadOwnerResult = {
    handleSelectSession: (sessionId: string) => void
    handleSessionIntent: (sessionId: string, source: SessionIntentSource) => void
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

export function useSessionsShellPreloadOwner(
    options: UseSessionsShellPreloadOwnerOptions
): UseSessionsShellPreloadOwnerResult {
    const lastSessionIntentRef = useRef<ReturnType<typeof createSessionIntentRecord> | null>(null)

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
            if (isSelectedSession(options.selectedSessionId, sessionId)) {
                return
            }

            runPreloadedNavigation(
                () =>
                    preloadSelectedSession({
                        api: options.api,
                        queryClient: options.queryClient,
                        sessionId,
                    }),
                () => {
                    void options.navigate({
                        to: '/sessions/$sessionId',
                        params: { sessionId },
                    })
                },
                buildSessionHref(sessionId)
            )
        },
        [options.api, options.navigate, options.queryClient, options.selectedSessionId]
    )

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
    }
}
