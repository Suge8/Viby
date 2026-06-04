import { type Dispatch, type SetStateAction, useEffect, useRef } from 'react'
import { clearRetainedReady, getRetainedReady } from '@/remote/RemotePairingPersistence'
import type { RemotePairingReadyConnection } from '@/remote/RemotePairingReadyShell'
import {
    isRemotePairingApproved,
    type RemotePairingAuthResult,
    resolveRemotePairingAuth,
} from '@/remote/remotePairingAuthFlow'
import { type PairingRemoteAuth, rememberRemotePairingId } from '@/remote/remotePairingHttp'
import type { RemoteState } from './RemotePairingController'
import { getRemotePairingErrorKeyOrFallback } from './remotePairingErrors'

export type { RemotePairingAuthResult }

export function clearRetainedReadySoon(pairingId: string): void {
    queueMicrotask(() => clearRetainedReady(pairingId).catch(() => undefined))
}

export function useRemotePairingBoot(options: {
    bootAttempt: number
    initialAuth?: RemotePairingAuthResult | null
    pairingId: string
    setState: Dispatch<SetStateAction<RemoteState>>
    startSession(auth: PairingRemoteAuth, token: string): Promise<RemotePairingReadyConnection>
}): void {
    const { bootAttempt, initialAuth, pairingId, setState, startSession } = options
    const consumedInitialAuthRef = useRef<string | null>(null)
    useEffect(() => {
        let disposed = false
        rememberRemotePairingId(pairingId)
        async function boot(): Promise<void> {
            setState({ kind: 'hydrating', phase: 'authenticating' })
            if (
                initialAuth?.auth.pairing.id === pairingId &&
                consumedInitialAuthRef.current !== initialAuth.token &&
                isRemotePairingApproved(initialAuth.auth)
            ) {
                consumedInitialAuthRef.current = initialAuth.token
                setState({ kind: 'hydrating', phase: 'opening-relay' })
                return void (await startSession(initialAuth.auth, initialAuth.token))
            }
            const retained = await readRetainedReady(pairingId)
            const resumed = await resolveRemotePairingAuth(pairingId)
            if (disposed) return
            if (resumed && isRemotePairingApproved(resumed.auth)) {
                setState({ kind: 'hydrating', phase: 'opening-relay' })
                return void (await startSession(resumed.auth, resumed.token))
            }
            // No live session — the host's invite is still posted, so the
            // phone needs to type the 6-digit code displayed on the desktop.
            if (retained) {
                setState({ kind: 'fatal', errorKey: 'remotePairing.error.regenerateQr' })
                return
            }
            setState({ kind: 'code-input', submitting: false })
        }
        boot().catch((error) => {
            if (!disposed) setState({ kind: 'fatal', errorKey: getRemotePairingErrorKeyOrFallback(error) })
        })
        return () => {
            disposed = true
        }
    }, [bootAttempt, initialAuth, pairingId, setState, startSession])
}

async function readRetainedReady(pairingId: string): Promise<{ lastReadyAt: number } | null> {
    try {
        return await getRetainedReady(pairingId)
    } catch {
        return null
    }
}
