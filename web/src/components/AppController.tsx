import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useRouter } from '@tanstack/react-router'
import { type ComponentProps, type JSX, lazy, Suspense, useEffect, useMemo, useRef } from 'react'
import {
    AppReadyShell,
    createReadyAppSession,
    type ReadyAppSession,
    resolveDisplayAppSession,
} from '@/components/appControllerSupport'
import type { LoginPromptServerConfig } from '@/components/LoginPrompt'
import { useAuth } from '@/hooks/useAuth'
import { useAuthSource } from '@/hooks/useAuthSource'
import { useFinalizeBootShell } from '@/hooks/useFinalizeBootShell'
import { useServerUrl } from '@/hooks/useServerUrl'
import { initializeTheme } from '@/hooks/useTheme'
import { useViewportInteractionGuards } from '@/hooks/useViewportInteractionGuards'
import { getAppViewportRoute, isUnauthorizedAuthError } from '@/lib/appShellPresentation'
import { requireHubUrlForLogin } from '@/lib/runtime-config'

const REQUIRE_SERVER_URL = requireHubUrlForLogin()
const AUTH_QUERY_PARAM_KEYS = ['server', 'hub', 'token'] as const

async function loadLoginPromptModule(): Promise<{
    default: (props: ComponentProps<typeof import('@/components/LoginPrompt').LoginPrompt>) => JSX.Element
}> {
    const module = await import('@/components/LoginPrompt')
    return { default: module.LoginPrompt }
}

const LazyLoginPrompt = lazy(loadLoginPromptModule)

async function loadAppRealtimeRuntimeModule() {
    const module = await import('@/components/AppRealtimeRuntime')
    return { default: module.AppRealtimeRuntime }
}

const LazyAppRealtimeRuntime = lazy(loadAppRealtimeRuntimeModule)

export function AppController(): JSX.Element | null {
    const { serverUrl, baseUrl, setServerUrl, clearServerUrl } = useServerUrl()
    const { authSource, setAccessToken, clearAuth } = useAuthSource(baseUrl)
    const { token, api, error: authError } = useAuth(authSource, baseUrl)
    const pathname = useLocation({ select: (location) => location.pathname })
    const router = useRouter()

    useEffect(() => {
        initializeTheme()
    }, [])
    useViewportInteractionGuards()

    const queryClient = useQueryClient()
    const appViewportRoute = getAppViewportRoute(pathname)
    const baseUrlRef = useRef(baseUrl)
    const retainedReadySessionRef = useRef<ReadyAppSession | null>(null)
    const loginPromptServer = useMemo<LoginPromptServerConfig>(
        () => ({
            baseUrl,
            serverUrl,
            setServerUrl,
            clearServerUrl,
            requireServerUrl: REQUIRE_SERVER_URL,
        }),
        [baseUrl, clearServerUrl, serverUrl, setServerUrl]
    )
    const readyAppSession = useMemo(() => createReadyAppSession(token, api, baseUrl), [api, baseUrl, token])
    const displayAppSession = resolveDisplayAppSession({
        authError,
        authSource,
        baseUrl,
        readyAppSession,
        retainedReadySessionRef,
    })
    const rootSurface = displayAppSession ? 'app' : !authSource || Boolean(authError) ? 'login' : 'pending'
    const shouldFinalizeRootBootShell =
        rootSurface === 'login' || (rootSurface === 'app' && appViewportRoute !== 'session-chat')

    useFinalizeBootShell(shouldFinalizeRootBootShell)

    useEffect(() => {
        if (baseUrlRef.current === baseUrl) {
            return
        }
        baseUrlRef.current = baseUrl
        queryClient.clear()
        retainedReadySessionRef.current = null
    }, [baseUrl, queryClient])

    useEffect(() => {
        if (authSource && isUnauthorizedAuthError(authError) && (!token || !api)) {
            clearAuth()
        }
    }, [api, authError, authSource, clearAuth, token])

    useEffect(() => {
        if (!readyAppSession) {
            return
        }
        void loadAppRealtimeRuntimeModule()

        const { pathname, search, hash, state } = router.history.location
        const searchParams = new URLSearchParams(search)
        const hasAuthQueryParams = AUTH_QUERY_PARAM_KEYS.some((key) => searchParams.has(key))
        if (!hasAuthQueryParams) {
            return
        }
        for (const key of AUTH_QUERY_PARAM_KEYS) {
            searchParams.delete(key)
        }
        const nextSearch = searchParams.toString()
        const nextHref = `${pathname}${nextSearch ? `?${nextSearch}` : ''}${hash}`
        router.history.replace(nextHref, state)
    }, [readyAppSession, router])

    if (displayAppSession) {
        return (
            <AppReadyShell appViewportRoute={appViewportRoute} session={displayAppSession}>
                <Suspense fallback={null}>
                    <LazyAppRealtimeRuntime
                        api={displayAppSession.api}
                        token={displayAppSession.token}
                        baseUrl={displayAppSession.baseUrl}
                    />
                </Suspense>
            </AppReadyShell>
        )
    }

    if (!authSource || authError) {
        return (
            <Suspense fallback={null}>
                <LazyLoginPrompt
                    onLogin={setAccessToken}
                    server={loginPromptServer}
                    error={authSource ? authError : undefined}
                />
            </Suspense>
        )
    }

    return null
}
