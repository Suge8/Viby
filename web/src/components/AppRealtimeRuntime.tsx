import { useQueryClient } from '@tanstack/react-query'
import { useMatchRoute, useRouter } from '@tanstack/react-router'
import { type JSX, lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react'
import type { ApiClient } from '@/api/client'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useRealtimeConnection } from '@/hooks/useRealtimeConnection'
import { type RealtimeBannerState, useRealtimeFeedback } from '@/hooks/useRealtimeFeedback'
import {
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
import { runRealtimeRecovery } from '@/lib/realtimeRecovery'
import { reportWebRuntimeError } from '@/lib/runtimeDiagnostics'
import { presentToastEvent } from '@/lib/toastNoticePresentation'
import { useTranslation } from '@/lib/use-translation'
import type { SyncEvent } from '@/types/api'

async function loadAppFloatingNoticeLayerModule() {
    const module = await import('@/components/AppFloatingNoticeLayer')
    return { default: module.AppFloatingNoticeLayer }
}

async function loadInstallPromptModule() {
    const module = await import('@/components/InstallPrompt')
    return { default: module.InstallPrompt }
}

const LazyAppFloatingNoticeLayer = lazy(loadAppFloatingNoticeLayerModule)
const LazyInstallPrompt = lazy(loadInstallPromptModule)

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

const SILENT_STALE_RECOVERY_IDLE_MS = 45_000
const SILENT_STALE_RECOVERY_CHECK_INTERVAL_MS = 15_000
const PAGE_RESTORE_RECOVERY_DELAY_MS = 0
const FOREGROUND_RECOVERY_DEDUP_MS = 1_000

export function AppRealtimeRuntime(props: AppRealtimeRuntimeProps): JSX.Element {
    const matchRoute = useMatchRoute()
    const router = useRouter()
    const queryClient = useQueryClient()
    const { addToast } = useNoticeCenter()
    const { t } = useTranslation()
    const sessionMatch = matchRoute({ to: '/sessions/$sessionId' })
    const selectedSessionId = getSelectedSessionId(sessionMatch)
    const { banner, handleConnect, handleDisconnect, handleConnectError, announceRecovery, runCatchupSync } =
        useRealtimeFeedback()
    const pushPromptedRef = useRef(false)
    const realtimeConnectedRef = useRef(false)
    const lastRealtimeSignalAtRef = useRef(Date.now())
    const lastForegroundRecoveryAtRef = useRef(0)
    const authoritativeRecoveryInFlightRef = useRef(false)
    const { isSupported, permission, ensureSubscription, pushEndpoint } = usePushNotifications(props.api)
    const installPromptSuppressed = shouldSuppressInstallPrompt({
        isReady: true,
        isAuthLoading: false,
        bannerKind: banner.kind,
    })

    const scheduleAuthoritativeRecovery = useCallback(
        (reason: 'socket-reconnect' | 'silent-stale' | 'page-restored') => {
            if (authoritativeRecoveryInFlightRef.current) {
                return
            }
            authoritativeRecoveryInFlightRef.current = true
            const shouldRunSilent = reason !== 'socket-reconnect'

            runCatchupSync(
                runRealtimeRecovery({
                    queryClient,
                    api: props.api,
                    selectedSessionId,
                })
                    .catch((error) => {
                        const message =
                            reason === 'socket-reconnect'
                                ? 'Failed to refresh queries after realtime reconnect.'
                                : reason === 'page-restored'
                                  ? 'Failed to refresh queries after page restore.'
                                  : 'Failed to refresh queries after silent realtime stall.'
                        reportWebRuntimeError(message, error)
                    })
                    .finally(() => {
                        authoritativeRecoveryInFlightRef.current = false
                        lastRealtimeSignalAtRef.current = Date.now()
                    }),
                shouldRunSilent ? { silent: true } : undefined
            )
        },
        [props.api, queryClient, runCatchupSync, selectedSessionId]
    )

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

            // Cold recovery already owns the screen through the boot shell.
            if (!consumeBootRecoverySurfaceOwner()) {
                announceRecovery(pendingRecovery.reason)
            }
        }

        function shouldRecoverForegroundNow(): boolean {
            const now = Date.now()
            if (now - lastForegroundRecoveryAtRef.current < FOREGROUND_RECOVERY_DEDUP_MS) {
                return false
            }

            lastForegroundRecoveryAtRef.current = now
            return true
        }

        return subscribeForegroundPulse((pulse: ForegroundPulse) => {
            if (!shouldRecoverForegroundNow()) {
                return
            }

            if (pulse.reason === 'pageshow-restored') {
                window.setTimeout(() => {
                    scheduleAuthoritativeRecovery('page-restored')
                }, PAGE_RESTORE_RECOVERY_DELAY_MS)
                return
            }

            if (pulse.reason === 'visible' || pulse.reason === 'resume') {
                scheduleAuthoritativeRecovery('silent-stale')
            }
        })
    }, [router, scheduleAuthoritativeRecovery])

    const handleRealtimeConnect = useCallback(
        (details: RealtimeConnectDetails) => {
            realtimeConnectedRef.current = true
            lastRealtimeSignalAtRef.current = Date.now()
            handleConnect(details)

            if (details.initial) {
                return
            }

            // Socket recovery is only a transport optimization; authoritative
            // session/message alignment always goes through the same recovery owner.
            scheduleAuthoritativeRecovery('socket-reconnect')
        },
        [handleConnect, scheduleAuthoritativeRecovery]
    )

    const handleRealtimeDisconnect = useCallback(
        (reason: string) => {
            realtimeConnectedRef.current = false
            handleDisconnect(reason)
        },
        [handleDisconnect]
    )

    const handleRealtimeError = useCallback(
        (error: unknown) => {
            handleConnectError(error)
        },
        [handleConnectError]
    )

    const handleToast = useCallback(
        (event: ToastEvent) => {
            const notice = presentToastEvent(event, t)
            addToast({
                title: notice.title,
                description: notice.description,
                tone: event.data.tone,
                href: event.data.url,
            })
        },
        [addToast, t]
    )

    const eventSubscription = useMemo(() => buildRealtimeSubscription(selectedSessionId), [selectedSessionId])

    const handleRealtimeEvent = useCallback((_event: SyncEvent) => {
        lastRealtimeSignalAtRef.current = Date.now()
    }, [])

    useEffect(() => {
        if (!props.token) {
            return
        }

        const intervalId = window.setInterval(() => {
            if (document.visibilityState !== 'visible') {
                return
            }
            if (!realtimeConnectedRef.current || authoritativeRecoveryInFlightRef.current) {
                return
            }
            if (Date.now() - lastRealtimeSignalAtRef.current < SILENT_STALE_RECOVERY_IDLE_MS) {
                return
            }

            lastRealtimeSignalAtRef.current = Date.now()
            scheduleAuthoritativeRecovery('silent-stale')
        }, SILENT_STALE_RECOVERY_CHECK_INTERVAL_MS)

        return () => {
            window.clearInterval(intervalId)
        }
    }, [props.token, scheduleAuthoritativeRecovery])

    useRealtimeConnection({
        enabled: true,
        token: props.token,
        baseUrl: props.baseUrl,
        subscription: eventSubscription,
        pushEndpoint,
        onConnect: handleRealtimeConnect,
        onDisconnect: handleRealtimeDisconnect,
        onError: handleRealtimeError,
        onEvent: handleRealtimeEvent,
        onToast: handleToast,
    })

    return (
        <>
            <Suspense fallback={null}>
                <LazyAppFloatingNoticeLayer api={props.api} banner={banner} />
            </Suspense>
            {!installPromptSuppressed ? (
                <Suspense fallback={null}>
                    <LazyInstallPrompt suppressed={false} />
                </Suspense>
            ) : null}
        </>
    )
}

export type { RealtimeBannerState }
