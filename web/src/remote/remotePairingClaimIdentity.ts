import { reportWebRuntimeWarning } from '@/lib/runtimeDiagnostics'
import { loadPairingDeviceIdentity } from '@/remote/remotePairingDevice'

const CLAIM_DEVICE_IDENTITY_TIMEOUT_MS = 1_500

export async function loadClaimDeviceIdentity(pairingId: string): Promise<{ publicKey: string } | null> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), CLAIM_DEVICE_IDENTITY_TIMEOUT_MS)
    })

    try {
        const identity = await Promise.race([loadPairingDeviceIdentity(pairingId), timeout])
        if (!identity) {
            reportWebRuntimeWarning('pairing device key load timed out during claim', { pairingId })
        }
        return identity
    } catch (error) {
        reportWebRuntimeWarning('pairing device key unavailable during claim', {
            pairingId,
            message: error instanceof Error ? error.message : String(error),
        })
        return null
    } finally {
        if (timeoutId) clearTimeout(timeoutId)
    }
}
