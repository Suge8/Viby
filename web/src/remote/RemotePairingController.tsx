import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useRouter } from '@tanstack/react-router'
import { hasPairingWorkspaceIntent, withPairingWorkspaceIntent } from '@viby/protocol'
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppInstallPromptLayer } from '@/components/AppInstallPromptLayer'
import { useFinalizeBootShell } from '@/hooks/useFinalizeBootShell'
import { subscribeForegroundPulse } from '@/lib/foregroundPulse'
import { type Notice, useNoticeCenter, usePersistentNotice } from '@/lib/notice-center'
import { buildCompactPersistentNotice, PERSISTENT_NOTICE_IDS } from '@/lib/persistentNoticePresentation'
import { queryKeys } from '@/lib/query-keys'
import { useTranslation } from '@/lib/use-translation'
import { type RemotePairingReadyConnection, RemotePairingReadyShell } from '@/remote/RemotePairingReadyShell'
import { RemotePairingCodeScreen, RemotePairingStatusScreen } from '@/remote/RemotePairingScreens'
import { isRemotePairingApproved, resolveRemotePairingAuth } from '@/remote/remotePairingAuthFlow'
import { type PairingRemoteAuth, rememberRemotePairingId, verifyRemotePairingCode } from '@/remote/remotePairingHttp'
import { pauseRemotePairingQueries, resumeRemotePairingQueries } from '@/remote/remotePairingQueryOnlineState'
import {
    createRemotePairingReconnectLoop,
    shouldRequestRemoteForegroundReconnect,
} from '@/remote/remotePairingReconnectLoop'
import { isRecoverableRemotePairingError } from '@/remote/remotePairingRecovery'
import { connectRemotePeer } from '@/remote/remotePairingTransport'
import {
    canRetryRemotePairingError,
    getRemotePairingErrorKeyOrFallback,
    type RemotePairingErrorKey,
} from './remotePairingErrors'
import {
    shouldBlockRemoteReadyShellInteraction,
    shouldRenderRemoteReadyShell,
    shouldShowRemoteReconnectNotice,
} from './remotePairingViewModel'

const REMOTE_RECONNECT_STALLED_ATTEMPT = 3

type RemoteState =
    | { kind: 'booting' }
    | { kind: 'reconnecting' }
    | { kind: 'approval'; auth: PairingRemoteAuth; token: string; submitting: boolean }
    | { kind: 'ready'; ready: RemotePairingReadyConnection }
    | { kind: 'error'; errorKey: RemotePairingErrorKey }

type RemotePairingControllerProps = { pairingId: string }
export function RemotePairingController(props: RemotePairingControllerProps): JSX.Element | null {
    const router = useRouter()
    const queryClient = useQueryClient()
    const pathname = useLocation({ select: (location) => location.pathname })
    const locationHref = useLocation({ select: (location) => location.href })
    const locationUrl = new URL(locationHref, 'https://viby.local')
    const locationSearch = locationUrl.search
    const locationHash = locationUrl.hash
    const { t } = useTranslation()
    const { addToast } = useNoticeCenter()
    const [state, setState] = useState<RemoteState>({ kind: 'booting' })
    const [retainedReady, setRetainedReady] = useState<RemotePairingReadyConnection | null>(null)
    const reconnectAttemptRef = useRef(0)
    const reconnectTimerRef = useRef<number | null>(null)
    const bootGenerationRef = useRef(0)
    const remoteQueriesPausedRef = useRef(false)
    const stateRef = useRef<RemoteState>({ kind: 'booting' })
    const retainedBridgeRef = useRef<RemotePairingReadyConnection['bridge'] | null>(null)
    const [reconnectAttempt, setReconnectAttempt] = useState(0)
    stateRef.current = state

    const hasRetainedReady = retainedReady !== null
    const activeReadyBridge = state.kind === 'ready' ? state.ready.bridge : null
    const showReconnectNotice = shouldShowRemoteReconnectNotice(state, hasRetainedReady)
    const reconnectNotice = useMemo<Notice>(() => {
        const isStalled = reconnectAttempt >= REMOTE_RECONNECT_STALLED_ATTEMPT
        return buildCompactPersistentNotice({
            id: PERSISTENT_NOTICE_IDS.remotePairingReconnect,
            tone: isStalled ? 'warning' : 'info',
            title: t(isStalled ? 'remotePairing.reconnectNotice.waitingTitle' : 'remotePairing.reconnectNotice.title'),
            description: t(
                isStalled
                    ? 'remotePairing.reconnectNotice.waitingDescription'
                    : 'remotePairing.reconnectNotice.description'
            ),
        })
    }, [reconnectAttempt, t])

    useFinalizeBootShell(state.kind !== 'booting' || hasRetainedReady)
    usePersistentNotice(showReconnectNotice ? reconnectNotice : null)

    useEffect(() => {
        if (showReconnectNotice) {
            remoteQueriesPausedRef.current = true
            pauseRemotePairingQueries(queryClient)
            return
        }

        const shouldRefetch = remoteQueriesPausedRef.current && state.kind === 'ready'
        remoteQueriesPausedRef.current = false
        resumeRemotePairingQueries(queryClient, { refetch: shouldRefetch })
    }, [queryClient, showReconnectNotice, state.kind])

    useEffect(() => {
        return () => resumeRemotePairingQueries(queryClient)
    }, [queryClient])

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
            }),
        []
    )

    const clearReconnectTimer = reconnectLoop.clearTimer
    const requestReconnect = reconnectLoop.requestReconnect
    const scheduleReconnect = reconnectLoop.scheduleReconnect

    const clearRetainedReady = useCallback(() => {
        retainedBridgeRef.current?.close()
        retainedBridgeRef.current = null
        setRetainedReady(null)
    }, [])

    const commitReady = useCallback(
        (ready: RemotePairingReadyConnection) => {
            if (retainedBridgeRef.current && retainedBridgeRef.current !== ready.bridge) {
                retainedBridgeRef.current.close()
            }
            queryClient.removeQueries({ queryKey: queryKeys.runtime, exact: true })
            retainedBridgeRef.current = ready.bridge
            setRetainedReady(ready)
            setReconnectAttempt(0)
            setState({ kind: 'ready', ready })
        },
        [queryClient]
    )

    const connectReadyBridge = useCallback(
        async (auth: PairingRemoteAuth, token: string): Promise<RemotePairingReadyConnection> => {
            const bridge = await connectRemotePeer({
                pairingId: props.pairingId,
                wsUrl: auth.wsUrl,
                iceServers: auth.iceServers,
            })
            clearReconnectTimer()
            reconnectAttemptRef.current = 0
            return { bridge, token }
        },
        [clearReconnectTimer, props.pairingId]
    )

    useEffect(() => {
        return () => {
            retainedBridgeRef.current?.close()
            retainedBridgeRef.current = null
        }
    }, [])

    useEffect(() => {
        let disposed = false
        const generation = bootGenerationRef.current
        rememberRemotePairingId(props.pairingId)

        async function boot(): Promise<void> {
            const { auth, token } = await resolveRemotePairingAuth(props.pairingId)
            if (!isRemotePairingApproved(auth)) {
                if (!reconnectLoop.isStale(disposed, generation)) {
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
        function handleResume(): void {
            if (shouldRequestRemoteForegroundReconnect({ kind: state.kind })) {
                requestReconnect()
            }
        }

        return subscribeForegroundPulse(handleResume)
    }, [requestReconnect, state.kind])

    useEffect(() => {
        if (state.kind !== 'ready') return
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
            if (!isRecoverableRemotePairingError(error)) {
                reconnectAttemptRef.current = 0
                clearRetainedReady()
                setState({ kind: 'error', errorKey: getRemotePairingErrorKeyOrFallback(error) })
                return
            }
            scheduleReconnect()
        })
    }, [activeReadyBridge, clearRetainedReady, scheduleReconnect])

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
    const installPrompt = showReconnectNotice ? null : <AppInstallPromptLayer />

    if (displayReady && shouldRenderRemoteReadyShell({ state, hasRetainedReady, pathname })) {
        return (
            <>
                <RemotePairingReadyShell
                    enableRuntime={state.kind === 'ready'}
                    interactionBlocked={shouldBlockRemoteReadyShellInteraction(state)}
                    pathname={pathname}
                    ready={displayReady}
                />
                {installPrompt}
            </>
        )
    }

    if (state.kind === 'approval') {
        return (
            <>
                <RemotePairingCodeScreen submitting={state.submitting} onSubmit={handleVerify} />
                {installPrompt}
            </>
        )
    }

    if (state.kind === 'booting' && !hasRetainedReady) {
        return null
    }

    const errorKey = state.kind === 'error' ? state.errorKey : null
    return (
        <RemotePairingStatusScreen
            message={errorKey ? t(errorKey) : null}
            onRetry={errorKey && canRetryRemotePairingError(errorKey) ? requestReconnect : undefined}
        />
    )
}
