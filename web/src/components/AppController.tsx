import { lazy, Suspense, type ComponentProps, type JSX, useEffect, useMemo, useRef } from 'react'
import { Outlet, useLocation, useRouter } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import type { LoginPromptServerConfig } from '@/components/LoginPrompt'
import { initializeTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'
import { useAuthSource } from '@/hooks/useAuthSource'
import { useViewportInteractionGuards } from '@/hooks/useViewportInteractionGuards'
import { useServerUrl } from '@/hooks/useServerUrl'
import {
    type AppViewportRoute,
    getAppViewportRoute,
    isUnauthorizedAuthError
} from '@/lib/appShellPresentation'
import { AppContextProvider } from '@/lib/app-context'
import { NoticeProvider } from '@/lib/notice-center'
import { requireHubUrlForLogin } from '@/lib/runtime-config'

const REQUIRE_SERVER_URL = requireHubUrlForLogin()
const AUTH_QUERY_PARAM_KEYS = ['server', 'hub', 'token'] as const

async function loadLoginPromptModule(): Promise<{ default: (props: ComponentProps<typeof import('@/components/LoginPrompt').LoginPrompt>) => JSX.Element }> {
    const module = await import('@/components/LoginPrompt')
    return { default: module.LoginPrompt }
}

const LazyLoginPrompt = lazy(loadLoginPromptModule)

async function loadAppRealtimeRuntimeModule() {
    const module = await import('@/components/AppRealtimeRuntime')
    return { default: module.AppRealtimeRuntime }
}

const LazyAppRealtimeRuntime = lazy(loadAppRealtimeRuntimeModule)

type AppViewportShellProps = {
    appViewportRoute: AppViewportRoute
}

function AppViewportShell(props: AppViewportShellProps): JSX.Element {
    return (
        <div className="app-shell flex h-full flex-col" data-viby-route={props.appViewportRoute}>
            <div className="app-route-layer min-h-0 flex-1">
                <div className="app-route-transition h-full min-h-0 w-full">
                    <Outlet />
                </div>
            </div>
        </div>
    )
}

export function AppController(): JSX.Element | null {
    const { serverUrl, baseUrl, setServerUrl, clearServerUrl } = useServerUrl()
    const { authSource, setAccessToken, clearAuth } = useAuthSource(baseUrl)
    const { token, api, error: authError } = useAuth(authSource, baseUrl)
    const pathname = useLocation({ select: location => location.pathname })
    const router = useRouter()

    useEffect(() => {
        initializeTheme()
    }, [])

    useViewportInteractionGuards()

    const queryClient = useQueryClient()
    const appViewportRoute = getAppViewportRoute(pathname)
    const baseUrlRef = useRef(baseUrl)
    const loginPromptServer = useMemo<LoginPromptServerConfig>(() => ({
        baseUrl,
        serverUrl,
        setServerUrl,
        clearServerUrl,
        requireServerUrl: REQUIRE_SERVER_URL
    }), [baseUrl, clearServerUrl, serverUrl, setServerUrl])

    useEffect(() => {
        if (baseUrlRef.current === baseUrl) {
            return
        }
        baseUrlRef.current = baseUrl
        queryClient.clear()
    }, [baseUrl, queryClient])

    useEffect(() => {
        document.documentElement.dataset.vibyRoute = appViewportRoute
        document.body.dataset.vibyRoute = appViewportRoute

        return () => {
            delete document.documentElement.dataset.vibyRoute
            delete document.body.dataset.vibyRoute
        }
    }, [appViewportRoute])

    useEffect(() => {
        if (!authSource || !isUnauthorizedAuthError(authError)) {
            return
        }
        if (token && api) {
            return
        }

        clearAuth()
    }, [api, authError, authSource, clearAuth, token])

    useEffect(() => {
        if (!token || !api) {
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
    }, [token, api, router])

    if (token && api) {
        return (
            <NoticeProvider>
                <AppContextProvider value={{ api, token, baseUrl }}>
                    <AppViewportShell appViewportRoute={appViewportRoute} />
                    <Suspense fallback={null}>
                        <LazyAppRealtimeRuntime
                            api={api}
                            token={token}
                            baseUrl={baseUrl}
                        />
                    </Suspense>
                </AppContextProvider>
            </NoticeProvider>
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
