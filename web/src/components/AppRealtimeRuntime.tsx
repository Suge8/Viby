import { Suspense, lazy, type JSX, useCallback, useEffect, useMemo, useRef } from 'react'
import { Outlet, useMatchRoute, useRouter } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useRealtimeConnection } from '@/hooks/useRealtimeConnection'
import { type RealtimeBannerState, useRealtimeFeedback } from '@/hooks/useRealtimeFeedback'
import { runRealtimeRecovery } from '@/lib/realtimeRecovery'
import { useNoticeCenter } from '@/lib/notice-center'
import { presentToastEvent } from '@/lib/toastNoticePresentation'
import { useTranslation } from '@/lib/use-translation'
import {
    buildRealtimeSubscription,
    getSelectedSessionId,
    shouldSuppressInstallPrompt
} from '@/lib/appShellPresentation'
import { consumeDiscardedPageRecovery, consumePendingAppRecovery } from '@/lib/appRecovery'
import type { SyncEvent } from '@/types/api'

const LazyAppFloatingNoticeLayer = lazy(async () => {
    const module = await import('@/components/AppFloatingNoticeLayer')
    return { default: module.AppFloatingNoticeLayer }
})

const LazyInstallPrompt = lazy(async () => {
    const module = await import('@/components/InstallPrompt')
    return { default: module.InstallPrompt }
})

type ToastEvent = Extract<SyncEvent, { type: 'toast' }>
type RealtimeConnectDetails = {
    initial: boolean
    recovered: boolean
    transport: string | null
}

type AppRealtimeRuntimeProps = {
    api: ApiClient
    token: string
    baseUrl: string
    appViewportRoute: string
}

export function AppRealtimeRuntime(props: AppRealtimeRuntimeProps): JSX.Element {
    const matchRoute = useMatchRoute()
    const router = useRouter()
    const queryClient = useQueryClient()
    const { addToast } = useNoticeCenter()
    const { t } = useTranslation()
    const sessionMatch = matchRoute({ to: '/sessions/$sessionId' })
    const selectedSessionId = getSelectedSessionId(sessionMatch)
    const {
        banner,
        handleConnect,
        handleDisconnect,
        handleConnectError,
        announceRecovery,
        runCatchupSync
    } = useRealtimeFeedback()
    const pushPromptedRef = useRef(false)
    const { isSupported, permission, ensureSubscription, pushEndpoint } = usePushNotifications(props.api)
    const installPromptSuppressed = shouldSuppressInstallPrompt({
        isReady: true,
        isAuthLoading: false,
        bannerKind: banner.kind
    })

    useEffect(() => {
        if (!props.token) {
            pushPromptedRef.current = false
            return
        }
        if (!isSupported || pushPromptedRef.current) {
            return
        }

        pushPromptedRef.current = true
        void (async () => {
            if (permission === 'granted') {
                await ensureSubscription()
            }
        })()
    }, [ensureSubscription, isSupported, permission, props.token])

    useEffect(() => {
        const pendingRecovery = consumePendingAppRecovery() ?? consumeDiscardedPageRecovery()
        if (pendingRecovery) {
            const { pathname, search, hash, state } = router.history.location
            const currentHref = `${pathname}${search}${hash}`
            if (pendingRecovery.resumeHref && pendingRecovery.resumeHref !== currentHref) {
                router.history.replace(pendingRecovery.resumeHref, state)
            }
            announceRecovery(pendingRecovery.reason)
        }

        function handlePageShow(event: PageTransitionEvent): void {
            if (event.persisted) {
                announceRecovery('page-restored')
            }
        }

        window.addEventListener('pageshow', handlePageShow)
        return () => {
            window.removeEventListener('pageshow', handlePageShow)
        }
    }, [announceRecovery, router])

    const handleRealtimeConnect = useCallback((details: RealtimeConnectDetails) => {
        handleConnect(details)

        if (details.initial || details.recovered) {
            return
        }

        runCatchupSync(
            runRealtimeRecovery({
                queryClient,
                api: props.api,
                selectedSessionId
            }).catch((error) => {
                console.error('Failed to refresh queries after realtime reconnect:', error)
            })
        )
    }, [handleConnect, props.api, queryClient, runCatchupSync, selectedSessionId])

    const handleRealtimeDisconnect = useCallback((reason: string) => {
        handleDisconnect(reason)
    }, [handleDisconnect])

    const handleRealtimeError = useCallback((error: unknown) => {
        handleConnectError(error)
    }, [handleConnectError])

    const handleToast = useCallback((event: ToastEvent) => {
        const notice = presentToastEvent(event, t)
        addToast({
            title: notice.title,
            description: notice.description,
            tone: event.data.tone,
            href: event.data.url
        })
    }, [addToast, t])

    const eventSubscription = useMemo(() => buildRealtimeSubscription(selectedSessionId), [selectedSessionId])

    useRealtimeConnection({
        enabled: true,
        token: props.token,
        baseUrl: props.baseUrl,
        subscription: eventSubscription,
        pushEndpoint,
        onConnect: handleRealtimeConnect,
        onDisconnect: handleRealtimeDisconnect,
        onError: handleRealtimeError,
        onEvent: () => {},
        onToast: handleToast
    })

    return (
        <>
            <Suspense fallback={null}>
                <LazyAppFloatingNoticeLayer banner={banner} />
            </Suspense>
            <div className="app-shell flex h-full flex-col" data-viby-route={props.appViewportRoute}>
                <div className="app-route-layer min-h-0 flex-1">
                    <div className="app-route-transition h-full min-h-0 w-full">
                        <Outlet />
                    </div>
                </div>
            </div>
            <Suspense fallback={null}>
                <LazyInstallPrompt suppressed={installPromptSuppressed} />
            </Suspense>
        </>
    )
}

export type { RealtimeBannerState }
