import { recoverRemotePairingFromCookie } from '@/remote/remotePairingCookieRecover'
import type { PairingRemoteAuth } from '@/remote/remotePairingHttp'
import {
    claimRemotePwaHandoff,
    getGuestToken,
    getPairingHandoffTicketFromLocation,
    RemotePairingHttpError,
    reconnectRemotePairing,
    recoverRemotePairingByDevice,
    scrubPairingLaunchSecretFromUrl,
} from '@/remote/remotePairingHttp'
import { createRemotePairingCodedError, createRemotePairingUserError } from './remotePairingErrors'
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

function isReplacedControlPlane(error: unknown): boolean {
    return error instanceof RemotePairingHttpError && error.serverCode === 'pairing_invalid_token'
}

async function resumeRemotePairing(pairingId: string, handoffTicket: string | null): Promise<PairingRemoteAuth | null> {
    if (handoffTicket) {
        try {
            const auth = await claimRemotePwaHandoff(pairingId, handoffTicket)
            scrubPairingLaunchSecretFromUrl()
            return auth
        } catch (error) {
            const auth = await claimCookieHandoff(pairingId)
            if (auth) {
                scrubPairingLaunchSecretFromUrl()
                return auth
            }
            throw error
        }
    }

    const handoffAuth = await claimCookieHandoff(pairingId)
    if (handoffAuth) return handoffAuth

    try {
        const auth = await reconnectRemotePairing(pairingId)
        if (auth) return auth
    } catch (error) {
        if (isReplacedControlPlane(error)) throw createRemotePairingCodedError('remotePairing.error.connectionReplaced')
        if (isRecoverableRemotePairingError(error)) throw error
    }

    return await recoverRemotePairingByDevice(pairingId)
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
