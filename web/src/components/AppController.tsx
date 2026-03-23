import { lazy, Suspense, type JSX, useEffect, useMemo, useRef } from 'react'
import { useLocation, useRouter } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { initializeTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'
import { useAuthSource } from '@/hooks/useAuthSource'
import { useViewportInteractionGuards } from '@/hooks/useViewportInteractionGuards'
import { useServerUrl } from '@/hooks/useServerUrl'
import {
    getAppViewportRoute,
    isUnauthorizedAuthError,
    renderAuthorizingState
} from '@/lib/appShellPresentation'
import { AppContextProvider } from '@/lib/app-context'
import { useTranslation } from '@/lib/use-translation'
import { requireHubUrlForLogin } from '@/lib/runtime-config'
import type { LoginPromptServerConfig } from '@/components/LoginPrompt'

const REQUIRE_SERVER_URL = requireHubUrlForLogin()
const LazyLoginPrompt = lazy(async () => {
    const module = await import('@/components/LoginPrompt')
    return { default: module.LoginPrompt }
})

const LazyAppRealtimeRuntime = lazy(async () => {
    const module = await import('@/components/AppRealtimeRuntime')
    return { default: module.AppRealtimeRuntime }
})

export function AppController(): JSX.Element {
    const { t } = useTranslation()
    const { serverUrl, baseUrl, setServerUrl, clearServerUrl } = useServerUrl()
    const { authSource, setAccessToken, clearAuth } = useAuthSource(baseUrl)
    const { token, api, isLoading: isAuthLoading, error: authError } = useAuth(authSource, baseUrl)
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

        clearAuth()
    }, [authError, authSource, clearAuth])

    useEffect(() => {
        if (!token || !api) {
            return
        }
        const { pathname, search, hash, state } = router.history.location
        const searchParams = new URLSearchParams(search)
        if (!searchParams.has('server') && !searchParams.has('hub') && !searchParams.has('token')) {
            return
        }
        searchParams.delete('server')
        searchParams.delete('hub')
        searchParams.delete('token')
        const nextSearch = searchParams.toString()
        const nextHref = `${pathname}${nextSearch ? `?${nextSearch}` : ''}${hash}`
        router.history.replace(nextHref, state)
    }, [token, api, router])

    if (!authSource) {
        return (
            <Suspense fallback={renderAuthorizingState(t)}>
                <LazyLoginPrompt
                    onLogin={setAccessToken}
                    server={loginPromptServer}
                />
            </Suspense>
        )
    }

    if (authError) {
        return (
            <Suspense fallback={renderAuthorizingState(t)}>
                <LazyLoginPrompt
                    onLogin={setAccessToken}
                    server={loginPromptServer}
                    error={authError}
                />
            </Suspense>
        )
    }

    if (isAuthLoading || !token || !api) {
        return renderAuthorizingState(t)
    }

    return (
        <AppContextProvider value={{ api, token, baseUrl }}>
            <Suspense fallback={renderAuthorizingState(t)}>
                <LazyAppRealtimeRuntime
                    api={api}
                    token={token}
                    baseUrl={baseUrl}
                    appViewportRoute={appViewportRoute}
                />
            </Suspense>
        </AppContextProvider>
    )
}
