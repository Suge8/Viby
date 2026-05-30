import { useLocation, useRouter } from '@tanstack/react-router'
import { isPairingWorkspacePath, withPairingWorkspaceIntent } from '@viby/protocol'
import { type JSX, useEffect, useRef, useState } from 'react'
import { useFinalizeBootShell } from '@/hooks/useFinalizeBootShell'
import type { RemoteConnectingPhase } from '@/lib/remoteConnectingPhase'
import { reportWebRuntimeError } from '@/lib/runtimeDiagnostics'
import { useTranslation } from '@/lib/use-translation'
import { RemotePairingMissingScreen, RemotePairingStatusScreen } from './RemotePairingScreens'
import { type PairingCookieRecoverFailure, recoverRemotePairingFromCookie } from './remotePairingCookieRecover'
import { recoverAnyRemotePairingByDevice } from './remotePairingDeviceRecovery'
import { claimRemotePwaHandoff, rememberRemotePairingId } from './remotePairingHttp'

type BootstrapState =
    | { kind: 'attempting'; phase: RemoteConnectingPhase }
    | { kind: 'failed'; failure: PairingCookieRecoverFailure }

type RemotePwaBootstrapProps = {
    fallbackPairingId?: string | null
    onRecovered(pairingId: string): void
}

export function resolveRecoveredPairingHref(locationHref: string): string {
    const current = new URL(locationHref, 'https://viby.local')
    if (!isPairingWorkspacePath(current.pathname)) return withPairingWorkspaceIntent('/sessions')
    return withPairingWorkspaceIntent(`${current.pathname}${current.search}${current.hash}`)
}

/**
 * PWA cold-start bootstrap controller. When the workspace shell launches in
 * standalone mode without any storage state, this component asks the broker
 * to identify the pairing through the signed manifest cookie and immediately
 * claims the returned handoff ticket from React state — no
 * `window.location` navigation. A full-page navigation would force the PWA
 * to reload `/p/<id>` HTML, auto-fetch the personalized manifest, and
 * overwrite the handoff ticket inside the broker store, leaving the new
 * page load to claim an already-superseded ticket and 403 out.
 *
 * After the claim succeeds the bootstrap hands control to the root
 * `RemotePairingController` directly and keeps the URL on the workspace
 * route. That avoids a second `/p/<id>` loading owner during PWA handoff.
 */
export function RemotePwaBootstrap(props: RemotePwaBootstrapProps): JSX.Element {
    const { history } = useRouter()
    const locationHref = useLocation({ select: (location) => location.href })
    const { t } = useTranslation()
    const { fallbackPairingId, onRecovered } = props
    const attemptedRef = useRef(false)
    const [attemptKey, setAttemptKey] = useState(0)
    const [state, setState] = useState<BootstrapState>({ kind: 'attempting', phase: 'recovering-device' })
    useFinalizeBootShell(true)

    useEffect(() => {
        if (attemptedRef.current) return
        attemptedRef.current = true
        let disposed = false

        function replaceRecoveredRoute(): void {
            const href = resolveRecoveredPairingHref(locationHref)
            if (href === withPairingWorkspaceIntent('/sessions')) {
                history.replace(withPairingWorkspaceIntent('/sessions'))
                return
            }
            history.replace(href)
        }

        async function recoverFromCachedDevice(): Promise<boolean> {
            setState({ kind: 'attempting', phase: 'recovering-device' })
            const auth = await recoverAnyRemotePairingByDevice(fallbackPairingId ?? null)
            if (!auth) return false
            rememberRemotePairingId(auth.pairing.id)
            setState({ kind: 'attempting', phase: 'loading-workspace' })
            onRecovered(auth.pairing.id)
            replaceRecoveredRoute()
            return true
        }

        async function attempt(): Promise<void> {
            setState({ kind: 'attempting', phase: 'recovering-device' })
            const result = await recoverRemotePairingFromCookie()
            if (disposed) return
            if (!result.ok) {
                try {
                    if (await recoverFromCachedDevice()) return
                } catch (error) {
                    reportWebRuntimeError('Failed to recover remote pairing from cached device keys.', error)
                    if (!disposed) setState({ kind: 'failed', failure: { kind: 'transient' } })
                    return
                }
                setState({ kind: 'failed', failure: result.failure })
                return
            }
            try {
                setState({ kind: 'attempting', phase: 'authenticating' })
                await claimRemotePwaHandoff(result.value.pairingId, result.value.handoffTicket)
                if (disposed) return
                rememberRemotePairingId(result.value.pairingId)
                setState({ kind: 'attempting', phase: 'loading-workspace' })
                onRecovered(result.value.pairingId)
                replaceRecoveredRoute()
            } catch (error) {
                reportWebRuntimeError('Failed to consume PWA handoff ticket during bootstrap.', error)
                if (!disposed) setState({ kind: 'failed', failure: { kind: 'invalid' } })
            }
        }

        void attempt()

        return () => {
            disposed = true
        }
    }, [attemptKey, fallbackPairingId, history, locationHref, onRecovered])

    if (state.kind === 'attempting') {
        return <RemotePairingStatusScreen message={null} phase={state.phase} />
    }

    if (state.failure.kind === 'transient') {
        return (
            <RemotePairingStatusScreen
                message={t('remotePairing.error.closedRetrying')}
                onRetry={() => {
                    attemptedRef.current = false
                    setState({ kind: 'attempting', phase: 'recovering-device' })
                    setAttemptKey((current) => current + 1)
                }}
            />
        )
    }
    return <RemotePairingMissingScreen />
}
