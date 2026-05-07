import type { PairingRemoteAuth } from '@/remote/remotePairingHttp'
import {
    claimRemotePairing,
    getGuestToken,
    getPairingTicketFromLocation,
    reconnectRemotePairing,
    scrubPairingTicketFromUrl,
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

async function reconnectOrClaim(pairingId: string, ticket: string | null): Promise<PairingRemoteAuth | null> {
    let auth: PairingRemoteAuth | null = null
    try {
        auth = await reconnectRemotePairing(pairingId)
    } catch (error) {
        if (isRecoverableRemotePairingError(error) || !ticket) throw error
    }
    if (auth || !ticket) return auth

    const claimedAuth = await claimRemotePairing(pairingId, ticket)
    scrubPairingTicketFromUrl()
    return claimedAuth
}

export async function resolveRemotePairingAuth(pairingId: string): Promise<RemotePairingAuthResult> {
    const ticket = getPairingTicketFromLocation()
    const auth = await reconnectOrClaim(pairingId, ticket)
    if (!auth) {
        throw createRemotePairingUserError('remotePairing.error.regenerateQr')
    }

    const token = getGuestToken(auth)
    if (!token) {
        throw createRemotePairingUserError('remotePairing.error.scanAgain')
    }

    return { auth, token }
}
