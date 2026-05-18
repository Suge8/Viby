import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useRouter } from '@tanstack/react-router'
import { hasPairingWorkspaceIntent, withPairingWorkspaceIntent } from '@viby/protocol'
import type { PairingTransportState } from '@viby/protocol/pairing'
import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import { useFinalizeBootShell } from '@/hooks/useFinalizeBootShell'
import { useNoticeCenter } from '@/lib/notice-center'
import { RemotePairingControllerView } from '@/remote/RemotePairingControllerView'
import { setRetainedReady } from '@/remote/RemotePairingPersistence'
import type { RemotePairingReadyConnection } from '@/remote/RemotePairingReadyShell'
import { RemotePeerSession } from '@/remote/RemotePeerSession'
import { clearRetainedReadySoon, useRemotePairingBoot } from '@/remote/remotePairingBoot'
import { clearStoredGuestToken, type PairingRemoteAuth, verifyRemotePairingCode } from '@/remote/remotePairingHttp'
import { useRemotePairingPwaHandoffWarmup } from '@/remote/remotePairingPwaHandoffWarmup'
import { pauseRemotePairingQueries, resumeRemotePairingQueries } from '@/remote/remotePairingQueryOnlineState'
import { getRemotePairingErrorKeyOrFallback, type RemotePairingErrorKey } from './remotePairingErrors'
import { useRemoteReconnectNotice } from './remotePairingReconnectNotice'
import { shouldBlockRemoteReadyShellInteraction, shouldShowRemoteReconnectNotice } from './remotePairingViewModel'

type FirstPairingState = { kind: 'first-pairing'; auth: PairingRemoteAuth; token: string; submitting: boolean }
export type RemoteState =
    | { kind: 'hydrating' }
    | FirstPairingState
    | { kind: 'running'; ready: RemotePairingReadyConnection }
    | { kind: 'fatal'; errorKey: RemotePairingErrorKey }

const CONNECTING_SNAPSHOT = { kind: 'connecting', attempt: 0 } as const

type RemotePairingControllerProps = { pairingId: string }
export function RemotePairingController(props: RemotePairingControllerProps): JSX.Element | null {
    const router = useRouter()
    const queryClient = useQueryClient()
    const pathname = useLocation({ select: (location) => location.pathname })
    const locationHref = useLocation({ select: (location) => location.href })
    const locationUrl = new URL(locationHref, 'https://viby.local')
    const { addToast } = useNoticeCenter()
    const [state, setState] = useState<RemoteState>({ kind: 'hydrating' })
    const [bootAttempt, setBootAttempt] = useState(0)
    const [transportState, setTransportState] = useState<PairingTransportState>(CONNECTING_SNAPSHOT)
    const readyRef = useRef<RemotePairingReadyConnection | null>(null)
    const activeReady = state.kind === 'running' ? state.ready : readyRef.current
    const showReconnectNoticeRaw = useRemoteReconnectNotice({
        attempt: transportState.kind === 'connecting' ? transportState.attempt : 0,
        reconnecting: shouldShowRemoteReconnectNotice({ state, transportKind: transportState.kind }),
        onStop: activeReady
            ? () => {
                  activeReady.bridge.close()
                  clearRetainedReadySoon(props.pairingId)
                  setState({ kind: 'fatal', errorKey: 'remotePairing.error.userCancelled' })
              }
            : undefined,
    })

    useFinalizeBootShell(state.kind !== 'hydrating' || activeReady !== null)

    useEffect(() => {
        if (!activeReady) return setTransportState(CONNECTING_SNAPSHOT)
        setTransportState(activeReady.bridge.getSnapshot())
        return activeReady.bridge.transportSubscribe(() => setTransportState(activeReady.bridge.getSnapshot()))
    }, [activeReady])

    useEffect(() => {
        if (showReconnectNoticeRaw) {
            pauseRemotePairingQueries(queryClient)
            return
        }
        resumeRemotePairingQueries(queryClient, { refetch: state.kind === 'running' })
    }, [queryClient, showReconnectNoticeRaw, state.kind])

    const closeReady = useCallback(() => {
        readyRef.current?.bridge.close()
        readyRef.current = null
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
            readyRef.current = ready
            setState({ kind: 'hydrating' })
            try {
                await bridge.untilReady()
            } catch (error) {
                if (readyRef.current === ready) readyRef.current = null
                bridge.close()
                throw error
            }
            await setRetainedReady(props.pairingId, Date.now())
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
            if (state.kind !== 'first-pairing') return
            setState({ ...state, submitting: true })
            try {
                const verified = await verifyRemotePairingCode(props.pairingId, state.token, code)
                await startSession({ ...state.auth, pairing: verified.pairing }, state.token)
            } catch (error) {
                const errorKey = getRemotePairingErrorKeyOrFallback(error)
                setState({ ...state, submitting: false })
                addToast({ title: errorKey, tone: 'danger', compact: true })
            }
        },
        [addToast, props.pairingId, startSession, state]
    )

    const handleRetry = useCallback(() => {
        closeReady()
        clearRetainedReadySoon(props.pairingId)
        setState({ kind: 'hydrating' })
        setBootAttempt((attempt) => attempt + 1)
    }, [closeReady, props.pairingId])

    const pwaHandoffStatus = useRemotePairingPwaHandoffWarmup({
        pairingId: props.pairingId,
        active: state.kind === 'running',
    })
    return (
        <RemotePairingControllerView
            activeReady={activeReady}
            installPromptVisible={!showReconnectNoticeRaw && !!activeReady && pwaHandoffStatus === 'ready'}
            interactionBlocked={shouldBlockRemoteReadyShellInteraction(state, showReconnectNoticeRaw)}
            onRetry={handleRetry}
            onVerify={handleVerify}
            pathname={pathname}
            state={state}
        />
    )
}
