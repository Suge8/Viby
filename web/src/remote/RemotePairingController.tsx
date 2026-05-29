import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useRouter } from '@tanstack/react-router'
import { hasPairingWorkspaceIntent, withPairingWorkspaceIntent } from '@viby/protocol'
import type { PairingTransportState } from '@viby/protocol/pairing'
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFinalizeBootShell } from '@/hooks/useFinalizeBootShell'
import { useNoticeCenter } from '@/lib/notice-center'
import type { RemoteConnectingPhase } from '@/lib/remoteConnectingPhase'
import { reportWebRuntimeError } from '@/lib/runtimeDiagnostics'
import { useTranslation } from '@/lib/use-translation'
import { RemotePairingControllerView } from '@/remote/RemotePairingControllerView'
import { setRetainedReady } from '@/remote/RemotePairingPersistence'
import type { RemotePairingReadyConnection } from '@/remote/RemotePairingReadyShell'
import { RemotePeerSession } from '@/remote/RemotePeerSession'
import { clearRetainedReadySoon, useRemotePairingBoot } from '@/remote/remotePairingBoot'
import { RemotePeerConnectError } from '@/remote/remotePairingErrors'
import { clearStoredGuestToken, type PairingRemoteAuth, verifyRemotePairingCode } from '@/remote/remotePairingHttp'
import { installLanDeviceBinding } from '@/remote/remotePairingPostVerify'
import { useRemotePairingPwaHandoffWarmup } from '@/remote/remotePairingPwaHandoffWarmup'
import { resumeRemotePairingQueries } from '@/remote/remotePairingQueryOnlineState'
import { recordRemotePairingDiagnostic } from './remotePairingDiagnostics'
import { getRemotePairingErrorKeyOrFallback, type RemotePairingErrorKey } from './remotePairingErrors'
import { useRemoteQueryOnlineBridge, useRemoteTransportSnapshot } from './remotePairingReactHooks'
import { useRemoteReconnectNotice } from './remotePairingReconnectNotice'
import { buildRemotePairingConnectionChrome } from './remotePairingViewModel'

export type RemoteState =
    | { kind: 'hydrating'; phase: RemoteConnectingPhase }
    | { kind: 'code-input'; submitting: boolean }
    | { kind: 'running'; ready: RemotePairingReadyConnection }
    | { kind: 'fatal'; errorKey: RemotePairingErrorKey }

const CONNECTING_SNAPSHOT = { kind: 'connecting', attempt: 0 } as const

function persistRetainedReady(pairingId: string): void {
    void setRetainedReady(pairingId, Date.now()).catch((error) => {
        reportWebRuntimeError('Failed to persist remote pairing ready marker.', error)
    })
}

export function RemotePairingController(props: { pairingId: string }): JSX.Element | null {
    const router = useRouter()
    const queryClient = useQueryClient()
    const pathname = useLocation({ select: (location) => location.pathname })
    const locationHref = useLocation({ select: (location) => location.href })
    const locationUrl = new URL(locationHref, 'https://viby.local')
    const { addToast } = useNoticeCenter()
    const { t } = useTranslation()
    const [state, setState] = useState<RemoteState>({ kind: 'hydrating', phase: 'authenticating' })
    const [bootAttempt, setBootAttempt] = useState(0)
    const [transportState, setTransportState] = useState<PairingTransportState>(CONNECTING_SNAPSHOT)
    const readyRef = useRef<RemotePairingReadyConnection | null>(null)
    const pendingBridgeRef = useRef<RemotePeerSession | null>(null)
    const activeReady = state.kind === 'running' ? state.ready : readyRef.current
    const readyWorkspaceVisible = !!activeReady && pathname.startsWith('/sessions')
    const connectionChrome = useMemo(
        () => buildRemotePairingConnectionChrome({ readyWorkspaceVisible, state, t, transportState }),
        [readyWorkspaceVisible, state, t, transportState]
    )
    const handleStopReconnect = useCallback(() => {
        if (!activeReady) return
        activeReady.bridge.close()
        clearRetainedReadySoon(props.pairingId)
        setState({ kind: 'fatal', errorKey: 'remotePairing.error.userCancelled' })
    }, [activeReady, props.pairingId])
    useRemoteReconnectNotice({
        reconnect: connectionChrome.reconnect,
        onStop: activeReady ? handleStopReconnect : undefined,
    })

    useFinalizeBootShell(true)

    useRemoteTransportSnapshot({
        activeReady,
        connectingSnapshot: CONNECTING_SNAPSHOT,
        setTransportState,
    })
    useRemoteQueryOnlineBridge({
        chrome: connectionChrome,
        queryClient,
        running: state.kind === 'running',
    })

    const closeReady = useCallback(() => {
        readyRef.current?.bridge.close()
        pendingBridgeRef.current?.close()
        readyRef.current = pendingBridgeRef.current = null
    }, [])

    const startSession = useCallback(
        async (auth: PairingRemoteAuth, token: string): Promise<RemotePairingReadyConnection> => {
            const bridge = new RemotePeerSession({
                pairingId: props.pairingId,
                wsUrl: auth.wsUrl,
                tunnelUrl: auth.tunnelUrl,
                iceServers: auth.iceServers,
            })
            const ready = { bridge, token }
            pendingBridgeRef.current = bridge
            setState({ kind: 'hydrating', phase: 'connecting-computer' })
            try {
                await bridge.untilReady()
            } catch (error) {
                if (pendingBridgeRef.current === bridge) pendingBridgeRef.current = null
                bridge.close()
                throw error
            }
            readyRef.current = ready
            pendingBridgeRef.current = null
            persistRetainedReady(props.pairingId)
            recordRemotePairingDiagnostic('controller', { state: 'running' })
            setState({ kind: 'running', ready })
            return ready
        },
        [props.pairingId]
    )

    useRemotePairingBoot({ bootAttempt, pairingId: props.pairingId, setState, startSession })

    useEffect(() => {
        return () => {
            closeReady()
            clearRetainedReadySoon(props.pairingId)
            resumeRemotePairingQueries(queryClient)
        }
    }, [closeReady, props.pairingId, queryClient])

    useEffect(() => {
        if (!activeReady) return
        return activeReady.bridge.onClose((error) => {
            const errorKey = getRemotePairingErrorKeyOrFallback(error)
            if (errorKey === 'remotePairing.error.scanAgain') clearStoredGuestToken(props.pairingId)
            clearRetainedReadySoon(props.pairingId)
            closeReady()
            setState({ kind: 'fatal', errorKey })
        })
    }, [activeReady, closeReady, props.pairingId])

    useEffect(() => {
        if (state.kind !== 'running') return
        if (!pathname.startsWith('/sessions')) {
            router.history.replace(withPairingWorkspaceIntent('/sessions'))
            return
        }
        if (!hasPairingWorkspaceIntent(pathname, locationUrl.search)) {
            router.history.replace(withPairingWorkspaceIntent(`${pathname}${locationUrl.search}${locationUrl.hash}`))
        }
    }, [locationUrl.hash, locationUrl.search, pathname, router, state.kind])

    const handleVerify = useCallback(
        async (code: string) => {
            if (state.kind !== 'code-input') return
            setState({ kind: 'code-input', submitting: true })
            try {
                const result = await verifyRemotePairingCode(props.pairingId, code)
                if (result.mode === 'broker') return void (await startSession(result.auth, result.auth.guestToken))
                installLanDeviceBinding(result.auth)
                clearRetainedReadySoon(props.pairingId)
                window.location.replace('/sessions')
            } catch (error) {
                const errorKey = getRemotePairingErrorKeyOrFallback(error)
                if (error instanceof RemotePeerConnectError) {
                    setState({ kind: 'fatal', errorKey })
                    return
                }
                setState({ kind: 'code-input', submitting: false })
                addToast({ title: t(errorKey), tone: 'danger', compact: true })
            }
        },
        [addToast, props.pairingId, startSession, state.kind, t]
    )

    const handleRetry = useCallback(() => {
        closeReady()
        clearRetainedReadySoon(props.pairingId)
        setState({ kind: 'hydrating', phase: 'authenticating' })
        setBootAttempt((attempt) => attempt + 1)
    }, [closeReady, props.pairingId])

    const pwaHandoffStatus = useRemotePairingPwaHandoffWarmup({
        pairingId: props.pairingId,
        active: state.kind === 'running',
    })
    return (
        <RemotePairingControllerView
            activeReady={activeReady}
            installPromptVisible={!connectionChrome.reconnect && !!activeReady && pwaHandoffStatus === 'ready'}
            interactionBlocked={connectionChrome.interactionBlocked}
            linkBadgeOverride={connectionChrome.linkBadgeOverride}
            onRetry={handleRetry}
            onVerify={handleVerify}
            pathname={pathname}
            state={state}
        />
    )
}
