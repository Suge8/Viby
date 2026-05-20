import { listCachedPairingDeviceIds } from '@/remote/remotePairingDevice'
import {
    type PairingRemoteAuth,
    RemotePairingHttpError,
    reconnectRemotePairing,
    recoverRemotePairingByDevice,
} from '@/remote/remotePairingHttp'
import { isRecoverableRemotePairingError } from './remotePairingRecovery'

function orderPairingIds(ids: string[], preferredPairingId: string | null): string[] {
    const ordered = new Set<string>()
    if (preferredPairingId) ordered.add(preferredPairingId)
    for (const id of ids) ordered.add(id)
    return [...ordered]
}

function isTerminalPairingCredentialError(error: unknown): boolean {
    return error instanceof RemotePairingHttpError && !isRecoverableRemotePairingError(error)
}

async function tryRecoverPairing(pairingId: string): Promise<PairingRemoteAuth | null> {
    try {
        return (await reconnectRemotePairing(pairingId)) ?? (await recoverRemotePairingByDevice(pairingId))
    } catch (error) {
        if (isTerminalPairingCredentialError(error)) return null
        throw error
    }
}

export async function recoverAnyRemotePairingByDevice(
    preferredPairingId: string | null
): Promise<PairingRemoteAuth | null> {
    const pairingIds = orderPairingIds(await listCachedPairingDeviceIds(), preferredPairingId)
    for (const pairingId of pairingIds) {
        const auth = await tryRecoverPairing(pairingId)
        if (auth?.pairing.approvalStatus === 'approved') return auth
    }
    return null
}
