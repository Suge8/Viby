import { type Dispatch, type SetStateAction, useEffect } from 'react'
import { clearRetainedReady, getRetainedReady } from '@/remote/RemotePairingPersistence'
import type { RemotePairingReadyConnection } from '@/remote/RemotePairingReadyShell'
import { isRemotePairingApproved, resolveRemotePairingAuth } from '@/remote/remotePairingAuthFlow'
import { type PairingRemoteAuth, rememberRemotePairingId } from '@/remote/remotePairingHttp'
import type { RemoteState } from './RemotePairingController'
import { getRemotePairingErrorKeyOrFallback } from './remotePairingErrors'

export function clearRetainedReadySoon(pairingId: string): void {
    queueMicrotask(() => clearRetainedReady(pairingId).catch(() => undefined))
}

export function useRemotePairingBoot(options: {
    bootAttempt: number
    pairingId: string
    setState: Dispatch<SetStateAction<RemoteState>>
    startSession(auth: PairingRemoteAuth, token: string): Promise<RemotePairingReadyConnection>
}): void {
    const { bootAttempt, pairingId, setState, startSession } = options
    useEffect(() => {
        let disposed = false
        rememberRemotePairingId(pairingId)
        async function boot(): Promise<void> {
            const retained = await readRetainedReady(pairingId)
            const { auth, token } = await resolveRemotePairingAuth(pairingId)
            if (disposed) return
            if (isRemotePairingApproved(auth)) return void (await startSession(auth, token))
            setState(
                retained ? { kind: 'fatal', errorKey: 'remotePairing.error.regenerateQr' } : pendingPairing(auth, token)
            )
        }
        boot().catch((error) => {
            if (!disposed) setState({ kind: 'fatal', errorKey: getRemotePairingErrorKeyOrFallback(error) })
        })
        return () => {
            disposed = true
        }
    }, [bootAttempt, pairingId, setState, startSession])
}

async function readRetainedReady(pairingId: string): Promise<{ lastReadyAt: number } | null> {
    try {
        return await getRetainedReady(pairingId)
    } catch {
        return null
    }
}

function pendingPairing(auth: PairingRemoteAuth, token: string): RemoteState {
    return { kind: 'first-pairing', auth, token, submitting: false }
}
