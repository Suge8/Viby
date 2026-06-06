import { useLocation, useMatchRoute, useRouter } from '@tanstack/react-router'
import { type JSX, lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react'
import type { ApiClient } from '@/api/client'
import { AppInstallPromptLayer } from '@/components/AppInstallPromptLayer'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useRealtimeConnection } from '@/hooks/useRealtimeConnection'
import { type RealtimeBannerState, useRealtimeRecoveryRuntime } from '@/hooks/useRealtimeRecoveryRuntime'
import {
    type AppRecoveryReason,
    consumeBootRecoverySurfaceOwner,
    consumeDiscardedPageRecovery,
    consumePendingAppRecovery,
} from '@/lib/appRecovery'
import {
    buildRealtimeSubscription,
    getSelectedSessionId,
    shouldSuppressInstallPrompt,
} from '@/lib/appShellPresentation'
import { type ForegroundPulse, subscribeForegroundPulse } from '@/lib/foregroundPulse'
import { useNoticeCenter } from '@/lib/notice-center'
import { RealtimeRecoveryRuntime } from '@/lib/realtimeRecoveryRuntime'
import { presentSessionAttentionToast, type SessionAttentionSnapshot } from '@/lib/sessionAttentionToastController'
import { presentToastEvent } from '@/lib/toastNoticePresentation'
import { useTranslation } from '@/lib/use-translation'
import type { SyncEvent } from '@/types/api'

async function loadAppFloatingNoticeLayerModule() {
    const module = await import('@/components/AppFloatingNoticeLayer')
    return { default: module.AppFloatingNoticeLayer }
}

const LazyAppFloatingNoticeLayer = lazy(loadAppFloatingNoticeLayerModule)

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
}

function usePushSubscriptionMaintenance(api: ApiClient, token: string): string | null {
    const pushPromptedRef = useRef(false)
    const { isSupported, permission, ensureSubscription, pushEndpoint } = usePushNotifications(api)

    useEffect(() => {
        if (!token) {
            pushPromptedRef.current = false
            return
        }
        if (!isSupported || pushPromptedRef.current) return

        pushPromptedRef.current = true
        void (async () => {
            if (permission === 'granted') await ensureSubscription()
        })()
    }, [ensureSubscription, isSupported, permission, token])

    return pushEndpoint
}

function usePendingRecoveryAndForeground(
    announceRecovery: (reason: AppRecoveryReason) => void,
    runtime: RealtimeRecoveryRuntime
): void {
    const router = useRouter()

    useEffect(() => {
        const pendingRecovery = consumePendingAppRecovery() ?? consumeDiscardedPageRecovery()
        if (pendingRecovery) {
            const { pathname, search, hash, state } = router.history.location
            const currentHref = `${pathname}${search}${hash}`
            if (pendingRecovery.resumeHref && pendingRecovery.resumeHref !== currentHref) {
                router.history.replace(pendingRecovery.resumeHref, state)
            }
            if (!consumeBootRecoverySurfaceOwner()) announceRecovery(pendingRecovery.reason)
        }

        return subscribeForegroundPulse((pulse: ForegroundPulse) => {
            void runtime.handleForegroundPulse(pulse)
        })
    }, [announceRecovery, router, runtime])
}

function useRealtimeConnectionHandlers(runtime: RealtimeRecoveryRuntime, selectedSessionId: string | null) {
    const { addToast } = useNoticeCenter()
    const { t } = useTranslation()
    const onConnect = useCallback(
        (details: RealtimeConnectDetails) => void runtime.handleSocketConnect(details),
        [runtime]
    )
    const onDisconnect = useCallback(() => runtime.handleSocketDisconnect(), [runtime])
    const onError = useCallback(() => runtime.handleSocketError(), [runtime])
    const onEvent = useCallback((_event: SyncEvent) => undefined, [])

    const onToast = useCallback(
        (event: ToastEvent) => {
            if (event.data.kind === 'ready' || event.data.kind === 'permission-request') return
            const notice = presentToastEvent(event)
            addToast({
                title: notice.title,
                description: notice.description,
                tone: event.data.tone,
                href: event.data.url,
            })
        },
        [addToast]
    )

    const onSessionAttentionChange = useCallback(
        (change: { before: SessionAttentionSnapshot | null; after: SessionAttentionSnapshot | null }) => {
            if (document.visibilityState !== 'visible') return
            const notice = presentSessionAttentionToast({ ...change, selectedSessionId, t })
            if (notice) addToast(notice)
        },
        [addToast, selectedSessionId, t]
    )

    return { onConnect, onDisconnect, onError, onEvent, onToast, onSessionAttentionChange }
}

export function AppRealtimeRuntime(props: AppRealtimeRuntimeProps): JSX.Element {
    const matchRoute = useMatchRoute()
    const pathname = useLocation({ select: (location) => location.pathname })
    const selectedSessionId = getSelectedSessionId(matchRoute({ to: '/sessions/$sessionId' }))
    const { runtime, banner, announceRecovery } = useRealtimeRecoveryRuntime(props.api, selectedSessionId)
    const pushEndpoint = usePushSubscriptionMaintenance(props.api, props.token)
    const eventSubscription = useMemo(() => buildRealtimeSubscription(selectedSessionId), [selectedSessionId])
    const connectionHandlers = useRealtimeConnectionHandlers(runtime, selectedSessionId)

    usePendingRecoveryAndForeground(announceRecovery, runtime)
    useRealtimeConnection({
        enabled: true,
        token: props.token,
        baseUrl: props.baseUrl,
        subscription: eventSubscription,
        pushEndpoint,
        ...connectionHandlers,
    })

    const installPromptSuppressed = shouldSuppressInstallPrompt({
        isReady: true,
        isAuthLoading: false,
        bannerKind: banner.kind,
        pathname,
    })

    return (
        <>
            <Suspense fallback={null}>
                <LazyAppFloatingNoticeLayer api={props.api} banner={banner} />
            </Suspense>
            {!installPromptSuppressed ? <AppInstallPromptLayer /> : null}
        </>
    )
}

export type { RealtimeBannerState }
