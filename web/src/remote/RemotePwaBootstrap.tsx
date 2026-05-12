import { useRouter } from '@tanstack/react-router'
import { type JSX, useEffect, useRef, useState } from 'react'
import { reportWebRuntimeError } from '@/lib/runtimeDiagnostics'
import { useTranslation } from '@/lib/use-translation'
import { RemotePairingMissingScreen, RemotePairingStatusScreen } from './RemotePairingScreens'
import { type PairingCookieRecoverFailure, recoverRemotePairingFromCookie } from './remotePairingCookieRecover'
import { claimRemotePwaHandoff, rememberRemotePairingId } from './remotePairingHttp'

type BootstrapState = { kind: 'attempting' } | { kind: 'failed'; failure: PairingCookieRecoverFailure }

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
 * After the claim succeeds the bootstrap hands control off to the
 * `RemotePairingController` by performing a soft navigation to `/p/<id>`
 * via the router's history. That triggers `AppController` to re-read the
 * pairing id from the path and mount the controller at the top of the
 * tree, so the ready-state workspace renders without any nested bootstrap
 * scaffold left over.
 */
export function RemotePwaBootstrap(): JSX.Element {
    const router = useRouter()
    const { t } = useTranslation()
    const attemptedRef = useRef(false)
    const [state, setState] = useState<BootstrapState>({ kind: 'attempting' })

    useEffect(() => {
        if (attemptedRef.current) return
        attemptedRef.current = true
        let disposed = false

        async function attempt(): Promise<void> {
            const result = await recoverRemotePairingFromCookie()
            if (disposed) return
            if (!result.ok) {
                setState({ kind: 'failed', failure: result.failure })
                return
            }
            try {
                await claimRemotePwaHandoff(result.value.pairingId, result.value.handoffTicket)
                if (disposed) return
                rememberRemotePairingId(result.value.pairingId)
                // Soft-navigate so `AppController` re-reads the pairing id
                // from the path and mounts the standard remote controller at
                // the top of the tree. This avoids a full page reload (which
                // would trigger a fresh manifest fetch and rotate the broker
                // handoff ticket out from under the claim we just consumed).
                router.history.replace(`/p/${encodeURIComponent(result.value.pairingId)}`)
            } catch (error) {
                reportWebRuntimeError('Failed to consume PWA handoff ticket during bootstrap.', error)
                if (!disposed) setState({ kind: 'failed', failure: { kind: 'invalid' } })
            }
        }

        void attempt()

        return () => {
            disposed = true
        }
    }, [router])

    if (state.kind === 'attempting') {
        return <RemotePairingStatusScreen message={null} phase="pairing" />
    }

    if (state.failure.kind === 'transient') {
        return (
            <RemotePairingStatusScreen
                message={t('remotePairing.error.closedRetrying')}
                onRetry={() => {
                    attemptedRef.current = false
                    setState({ kind: 'attempting' })
                }}
            />
        )
    }
    return <RemotePairingMissingScreen />
}
