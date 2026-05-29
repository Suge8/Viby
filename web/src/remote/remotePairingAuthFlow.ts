import { recoverRemotePairingFromCookie } from '@/remote/remotePairingCookieRecover'
import type { PairingRemoteAuth } from '@/remote/remotePairingHttp'
import {
    claimRemotePwaHandoff,
    getGuestToken,
    getPairingHandoffTicketFromLocation,
    reconnectRemotePairing,
    recoverRemotePairingByDevice,
    scrubPairingLaunchSecretFromUrl,
} from '@/remote/remotePairingHttp'
import { createRemotePairingUserError } from './remotePairingErrors'
import { isRecoverableRemotePairingError } from './remotePairingRecovery'

export type RemotePairingAuthResult = {
    auth: PairingRemoteAuth
    token: string
}

export function isRemotePairingApproved(auth: PairingRemoteAuth): boolean {
    return auth.pairing.approvalStatus === 'approved'
}

/**
 * Resume an existing broker session for this device — guest token reconnect,
 * device-key recovery, or one-shot PWA handoff. Returns null when nothing in
 * the local credential store maps to a live session; the caller then drops
 * into the verify-code flow to perform a fresh Google-flow handshake.
 */
async function claimCookieHandoff(pairingId: string): Promise<PairingRemoteAuth | null> {
    const recovered = await recoverRemotePairingFromCookie()
    if (!recovered.ok || recovered.value.pairingId !== pairingId) return null
    return await claimRemotePwaHandoff(pairingId, recovered.value.handoffTicket)
}

async function resumeRemotePairing(pairingId: string, handoffTicket: string | null): Promise<PairingRemoteAuth | null> {
    let auth: PairingRemoteAuth | null = null
    try {
        auth = await reconnectRemotePairing(pairingId)
    } catch (error) {
        if (isRecoverableRemotePairingError(error)) throw error
    }

    try {
        auth ??= await recoverRemotePairingByDevice(pairingId)
    } catch (error) {
        if (isRecoverableRemotePairingError(error) || !handoffTicket) throw error
    }
    if (!auth && handoffTicket) {
        try {
            auth = await claimRemotePwaHandoff(pairingId, handoffTicket)
        } catch (error) {
            auth = await claimCookieHandoff(pairingId)
            if (!auth) throw error
        }
    }
    if (auth && handoffTicket) {
        scrubPairingLaunchSecretFromUrl()
    }
    return auth
}

export async function resolveRemotePairingAuth(pairingId: string): Promise<RemotePairingAuthResult | null> {
    const handoffTicket = getPairingHandoffTicketFromLocation()
    const auth = await resumeRemotePairing(pairingId, handoffTicket)
    if (!auth) return null

    const token = getGuestToken(auth)
    if (!token) {
        throw createRemotePairingUserError('remotePairing.error.scanAgain')
    }

    return { auth, token }
}
