import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useRouter } from '@tanstack/react-router'
import { hasPairingWorkspaceIntent, withPairingWorkspaceIntent } from '@viby/protocol'
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppInstallPromptLayer } from '@/components/AppInstallPromptLayer'
import { useFinalizeBootShell } from '@/hooks/useFinalizeBootShell'
import { useNoticeCenter, usePersistentNotice } from '@/lib/notice-center'
import { queryKeys } from '@/lib/query-keys'
import { getRemoteConnectingFallbackPhase, type RemoteConnectingPhase } from '@/lib/remoteConnectingPhase'
import { useTranslation } from '@/lib/use-translation'
import { useStickyTrue } from '@/lib/useStickyTrue'
import { type RemotePairingReadyConnection, RemotePairingReadyShell } from '@/remote/RemotePairingReadyShell'
import { RemotePairingCodeScreen, RemotePairingStatusScreen } from '@/remote/RemotePairingScreens'
import { RemotePeerSession } from '@/remote/RemotePeerSession'
import { isRemotePairingApproved, resolveRemotePairingAuth } from '@/remote/remotePairingAuthFlow'
import {
    clearStoredGuestToken,
    type PairingRemoteAuth,
    rememberRemotePairingId,
    verifyRemotePairingCode,
} from '@/remote/remotePairingHttp'
import { useRemotePairingPwaHandoffWarmup } from '@/remote/remotePairingPwaHandoffWarmup'
import { pauseRemotePairingQueries, resumeRemotePairingQueries } from '@/remote/remotePairingQueryOnlineState'
import { createRemotePairingReconnectLoop } from '@/remote/remotePairingReconnectLoop'
import { isRecoverableRemotePairingError } from '@/remote/remotePairingRecovery'
import { getRemotePairingErrorKeyOrFallback, type RemotePairingErrorKey } from './remotePairingErrors'
import {
    buildRemoteReconnectNotice,
    buildRemoteStatusSpec,
    shouldBlockRemoteReadyShellInteraction,
    shouldRenderRemoteReadyShell,
    shouldShowRemoteReconnectNotice,
} from './remotePairingViewModel'

type RemoteState =
    | { kind: 'booting' }
    | { kind: 'reconnecting' }
    | { kind: 'approval'; auth: PairingRemoteAuth; token: string; submitting: boolean }
    | { kind: 'ready'; ready: RemotePairingReadyConnection }
    | { kind: 'error'; errorKey: RemotePairingErrorKey }

const RECONNECT_NOTICE_MIN_VISIBLE_MS = 1200

type RemotePairingControllerProps = { pairingId: string }
export function RemotePairingController(props: RemotePairingControllerProps): JSX.Element | null {
    const router = useRouter()
    const queryClient = useQueryClient()
    const pathname = useLocation({ select: (location) => location.pathname })
    const locationHref = useLocation({ select: (location) => location.href })
    const locationUrl = new URL(locationHref, 'https://viby.local')
    const locationSearch = locationUrl.search
    const locationHash = locationUrl.hash
    const readyShellPathname = pathname
    const { t } = useTranslation()
    const { addToast } = useNoticeCenter()
    const [state, setState] = useState<RemoteState>({ kind: 'booting' })
    const [retainedReady, setRetainedReady] = useState<RemotePairingReadyConnection | null>(null)
    const [connectingPhase, setConnectingPhase] = useState<RemoteConnectingPhase>('pairing')
    const reconnectAttemptRef = useRef(0)
    const reconnectTimerRef = useRef<number | null>(null)
    const bootGenerationRef = useRef(0)
    const remoteQueriesPausedRef = useRef(false)
    const stateRef = useRef<RemoteState>({ kind: 'booting' })
    const retainedBridgeRef = useRef<RemotePairingReadyConnection['bridge'] | null>(null)
    const bootStartedAtRef = useRef<number>(Date.now())
    const reconnectErrorKeyRef = useRef<RemotePairingErrorKey>('remotePairing.error.fallback')
    const [reconnectAttempt, setReconnectAttempt] = useState(0)
    stateRef.current = state

    const hasRetainedReady = retainedReady !== null
    const activeReadyBridge = state.kind === 'ready' ? state.ready.bridge : null
    const showReconnectNoticeRaw = shouldShowRemoteReconnectNotice(state, hasRetainedReady)
    const showReconnectNotice = useStickyTrue(showReconnectNoticeRaw, RECONNECT_NOTICE_MIN_VISIBLE_MS)
    const reconnectNotice = useMemo(
        () => buildRemoteReconnectNotice({ t, phase: connectingPhase }),
        [connectingPhase, t]
    )

    useFinalizeBootShell()
    usePersistentNotice(showReconnectNotice ? reconnectNotice : null)

    useEffect(() => {
        if (showReconnectNoticeRaw) {
            remoteQueriesPausedRef.current = true
            pauseRemotePairingQueries(queryClient)
            return
        }

        const shouldRefetch = remoteQueriesPausedRef.current && state.kind === 'ready'
        remoteQueriesPausedRef.current = false
        resumeRemotePairingQueries(queryClient, { refetch: shouldRefetch })
    }, [queryClient, showReconnectNoticeRaw, state.kind])

    useEffect(() => {
        return () => resumeRemotePairingQueries(queryClient)
    }, [queryClient])

    const clearRetainedReady = useCallback(() => {
        retainedBridgeRef.current?.close()
        retainedBridgeRef.current = null
        setRetainedReady(null)
    }, [])

    const reconnectLoop = useMemo(
        () =>
            createRemotePairingReconnectLoop({
                stateRef,
                bootGenerationRef,
                reconnectAttemptRef,
                reconnectTimerRef,
                setBooting: () => setState({ kind: 'booting' }),
                setReconnecting: () => setState({ kind: 'reconnecting' }),
                bumpAttempt: () => setReconnectAttempt((attempt) => attempt + 1),
                onGiveUp: () => {
                    clearRetainedReady()
                    setState({ kind: 'error', errorKey: reconnectErrorKeyRef.current })
                },
            }),
        [clearRetainedReady]
    )

    const clearReconnectTimer = reconnectLoop.clearTimer
    const requestReconnect = reconnectLoop.requestReconnect
    const forceFreshAttempt = reconnectLoop.forceFreshAttempt
    const scheduleReconnect = reconnectLoop.scheduleReconnect

    const commitReady = useCallback(
        (ready: RemotePairingReadyConnection) => {
            if (retainedBridgeRef.current && retainedBridgeRef.current !== ready.bridge) {
                retainedBridgeRef.current.close()
            }
            queryClient.removeQueries({ queryKey: queryKeys.runtime, exact: true })
            retainedBridgeRef.current = ready.bridge
            setRetainedReady(ready)
            setReconnectAttempt(0)
            reconnectErrorKeyRef.current = 'remotePairing.error.fallback'
            setConnectingPhase('pairing')
            setState({ kind: 'ready', ready })
        },
        [queryClient]
    )

    const connectReadyBridge = useCallback(
        async (auth: PairingRemoteAuth, token: string): Promise<RemotePairingReadyConnection> => {
            setConnectingPhase('connecting')
            const bridge = new RemotePeerSession({
                pairingId: props.pairingId,
                wsUrl: auth.wsUrl,
                iceServers: auth.iceServers,
            })
            await bridge.untilReady()
            setConnectingPhase('finalizing')
            clearReconnectTimer()
            reconnectAttemptRef.current = 0
            return { bridge, token }
        },
        [clearReconnectTimer, props.pairingId]
    )
    // Single owner of the PWA handoff lifecycle: primes the manifest link the
    // moment we reach `ready` and rotates the ticket every 5 minutes so Safari
    // "Add to Home Screen" always reads a fresh secret. The returned status is
    // the only signal that gates the install banner — until it is `ready`,
    // the install affordance stays unmounted so users can never tap install
    // before the personalized manifest has been written to both owners (link
    // href + Service Worker cache).
    const pwaHandoffStatus = useRemotePairingPwaHandoffWarmup({
        pairingId: props.pairingId,
        active: state.kind === 'ready',
    })

    useEffect(() => {
        return () => {
            retainedBridgeRef.current?.close()
            retainedBridgeRef.current = null
        }
    }, [])

    useEffect(() => {
        let disposed = false
        const generation = bootGenerationRef.current
        bootStartedAtRef.current = Date.now()
        rememberRemotePairingId(props.pairingId)
        setConnectingPhase(getRemoteConnectingFallbackPhase(reconnectAttemptRef.current))

        async function boot(): Promise<void> {
            const { auth, token } = await resolveRemotePairingAuth(props.pairingId)
            if (!isRemotePairingApproved(auth)) {
                if (!reconnectLoop.isStale(disposed, generation)) {
                    setConnectingPhase('verify')
                    setState({ kind: 'approval', auth, token, submitting: false })
                }
                return
            }

            const ready = await connectReadyBridge(auth, token)
            if (reconnectLoop.closeIfStale(ready.bridge, disposed, generation)) return
            commitReady(ready)
        }

        boot().catch((error) => {
            if (reconnectLoop.isStale(disposed, generation)) return
            if (isRecoverableRemotePairingError(error)) {
                reconnectErrorKeyRef.current = getRemotePairingErrorKeyOrFallback(error)
                scheduleReconnect()
                return
            }
            clearRetainedReady()
            setState({ kind: 'error', errorKey: getRemotePairingErrorKeyOrFallback(error) })
        })

        return () => {
            disposed = true
        }
    }, [
        clearRetainedReady,
        commitReady,
        connectReadyBridge,
        props.pairingId,
        reconnectAttempt,
        reconnectLoop,
        scheduleReconnect,
    ])

    useEffect(() => {
        return () => clearReconnectTimer()
    }, [clearReconnectTimer])

    useEffect(() => {
        if (state.kind !== 'ready') return
        // Manifest `start_url` owns PWA launch, so the address bar never has to
        // carry the handoff secret. Always settle on the workspace URL once
        // approved; any URL outside `/sessions` is bounced back here.
        if (!pathname.startsWith('/sessions')) {
            router.history.replace(withPairingWorkspaceIntent('/sessions'))
            return
        }
        if (!hasPairingWorkspaceIntent(pathname, locationSearch)) {
            router.history.replace(withPairingWorkspaceIntent(`${pathname}${locationSearch}${locationHash}`))
        }
    }, [locationHash, locationSearch, pathname, router, state.kind])

    useEffect(() => {
        if (!activeReadyBridge) return
        return activeReadyBridge.onClose((error) => {
            const errorKey = getRemotePairingErrorKeyOrFallback(error)
            if (!isRecoverableRemotePairingError(error)) {
                // Final-state pairing errors (expired / scan-again) mean the
                // host actively tore down or removed this binding. Clear the
                // stored guest token so the next entry takes the user back to
                // the scan flow instead of looping into the same dead pairing.
                if (errorKey === 'remotePairing.error.expired' || errorKey === 'remotePairing.error.scanAgain') {
                    clearStoredGuestToken(props.pairingId)
                }
                reconnectAttemptRef.current = 0
                clearRetainedReady()
                setState({ kind: 'error', errorKey })
                return
            }
            reconnectErrorKeyRef.current = errorKey
            scheduleReconnect()
        })
    }, [activeReadyBridge, clearRetainedReady, props.pairingId, scheduleReconnect])

    const handleVerify = useCallback(
        async (code: string) => {
            if (state.kind !== 'approval') return
            setState({ ...state, submitting: true })
            try {
                const verified = await verifyRemotePairingCode(props.pairingId, state.token, code)
                const ready = await connectReadyBridge({ ...state.auth, pairing: verified.pairing }, state.token)
                commitReady(ready)
            } catch (error) {
                const errorKey = getRemotePairingErrorKeyOrFallback(error)
                if (errorKey !== 'remotePairing.error.rateLimited' && isRecoverableRemotePairingError(error)) {
                    reconnectErrorKeyRef.current = errorKey
                    scheduleReconnect()
                    return
                }
                setState({ ...state, submitting: false })
                addToast({ title: t(errorKey), tone: 'danger', compact: true })
            }
        },
        [addToast, commitReady, connectReadyBridge, props.pairingId, scheduleReconnect, state, t]
    )

    const displayReady = state.kind === 'ready' ? state.ready : retainedReady
    const installPrompt =
        showReconnectNoticeRaw || !displayReady || pwaHandoffStatus !== 'ready' ? null : <AppInstallPromptLayer />

    if (displayReady && shouldRenderRemoteReadyShell({ state, hasRetainedReady, pathname: readyShellPathname })) {
        return (
            <>
                <RemotePairingReadyShell
                    enableRuntime={state.kind === 'ready'}
                    interactionBlocked={shouldBlockRemoteReadyShellInteraction(state)}
                    pathname={readyShellPathname}
                    ready={displayReady}
                />
                {installPrompt}
            </>
        )
    }

    if (state.kind === 'approval') {
        return (
            <>
                {state.submitting ? (
                    <RemotePairingStatusScreen message={null} phase="verify" />
                ) : (
                    <RemotePairingCodeScreen submitting={false} onSubmit={handleVerify} />
                )}
                {installPrompt}
            </>
        )
    }

    if (state.kind === 'booting' && !hasRetainedReady) {
        return <RemotePairingStatusScreen message={null} phase={connectingPhase} />
    }

    const errorKey = state.kind === 'error' ? state.errorKey : null
    const status = buildRemoteStatusSpec(errorKey)
    return (
        <RemotePairingStatusScreen
            message={status.messageKey ? t(status.messageKey) : null}
            onRetry={status.retry ? requestReconnect : undefined}
            phase={connectingPhase}
        />
    )
}
