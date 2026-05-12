import type { PairingRemoteAuth } from '@/remote/remotePairingHttp'
import {
    claimRemotePairing,
    claimRemotePwaHandoff,
    getGuestToken,
    getPairingHandoffTicketFromLocation,
    getPairingTicketFromLocation,
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

async function reconnectOrClaim(
    pairingId: string,
    ticket: string | null,
    handoffTicket: string | null
): Promise<PairingRemoteAuth | null> {
    if (ticket) {
        const claimedAuth = await claimRemotePairing(pairingId, ticket)
        scrubPairingLaunchSecretFromUrl()
        return claimedAuth
    }

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
        auth = await claimRemotePwaHandoff(pairingId, handoffTicket)
    }
    if (auth && handoffTicket) {
        scrubPairingLaunchSecretFromUrl()
    }
    return auth
}

export async function resolveRemotePairingAuth(pairingId: string): Promise<RemotePairingAuthResult> {
    const ticket = getPairingTicketFromLocation()
    const handoffTicket = getPairingHandoffTicketFromLocation()
    const auth = await reconnectOrClaim(pairingId, ticket, handoffTicket)
    if (!auth) {
        throw createRemotePairingUserError('remotePairing.error.regenerateQr')
    }

    const token = getGuestToken(auth)
    if (!token) {
        throw createRemotePairingUserError('remotePairing.error.scanAgain')
    }

    return { auth, token }
}
