import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useRouter } from '@tanstack/react-router'
import { hasPairingWorkspaceIntent } from '@viby/protocol'
import { type ComponentProps, type JSX, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { RemotePairingController } from '@/remote/RemotePairingController'
import { RemotePwaBootstrap } from '@/remote/RemotePwaBootstrap'
import { readRemotePairingPathId, readStoredRemotePairingId } from '@/remote/remotePairingHttp'

const REQUIRE_SERVER_URL = requireHubUrlForLogin()
const AUTH_QUERY_PARAM_KEYS = ['hub', 'token'] as const

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
    const { authSource, setPairingCode, clearAuth } = useAuthSource(baseUrl)
    const { token, api, error: authError } = useAuth(authSource, baseUrl)
    const pathname = useLocation({ select: (location) => location.pathname })
    const locationHref = useLocation({ select: (location) => location.href })
    const router = useRouter()
    const locationSearch = new URL(locationHref, 'https://viby.local').search
    const [remotePairingId, setRemotePairingId] = useState(() => readRemotePairingPathId(pathname))
    const hasRemoteWorkspaceIntent = hasPairingWorkspaceIntent(pathname, locationSearch)
    const fallbackRemotePairingId = hasRemoteWorkspaceIntent ? readStoredRemotePairingId() : null

    useEffect(() => {
        initializeTheme()
    }, [])
    useViewportInteractionGuards()

    useEffect(() => {
        const nextPairingId = readRemotePairingPathId(pathname)
        if (nextPairingId) {
            setRemotePairingId(nextPairingId)
        }
    }, [pathname])

    const handleRemotePwaRecovered = useCallback((pairingId: string) => {
        setRemotePairingId(pairingId)
    }, [])

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
        !remotePairingId &&
        !hasRemoteWorkspaceIntent &&
        (rootSurface === 'login' || (rootSurface === 'app' && appViewportRoute !== 'session-chat'))

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

    if (remotePairingId) {
        return <RemotePairingController pairingId={remotePairingId} />
    }

    if (hasRemoteWorkspaceIntent) {
        // Workspace shell launched without any storage state. This is the
        // cold-start path for PWAs whose standalone partition is isolated
        // from the browser tab that performed the original claim. The
        // bootstrap controller asks the broker to recover the pairing via
        // the signed manifest cookie before falling back to a re-scan
        // prompt, so the common case becomes a one-round-trip auto-recovery.
        return <RemotePwaBootstrap fallbackPairingId={fallbackRemotePairingId} onRecovered={handleRemotePwaRecovered} />
    }

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
                    onLogin={setPairingCode}
                    server={loginPromptServer}
                    error={authSource ? authError : undefined}
                />
            </Suspense>
        )
    }

    return null
}
