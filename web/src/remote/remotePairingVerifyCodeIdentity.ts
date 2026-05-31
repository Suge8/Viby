import { reportWebRuntimeWarning } from '@/lib/runtimeDiagnostics'
import { loadPairingDeviceIdentity } from '@/remote/remotePairingDevice'

const VERIFY_CODE_DEVICE_IDENTITY_TIMEOUT_MS = 1_500

export async function loadVerifyCodeDeviceIdentity(pairingId: string): Promise<{ publicKey: string }> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), VERIFY_CODE_DEVICE_IDENTITY_TIMEOUT_MS)
    })

    try {
        const identity = await Promise.race([loadPairingDeviceIdentity(pairingId), timeout])
        if (identity) return identity
        reportWebRuntimeWarning('pairing device key load timed out during verify-code', { pairingId })
        throw new Error('pairing_device_key_unavailable')
    } catch (error) {
        reportWebRuntimeWarning('pairing device key unavailable during verify-code', {
            pairingId,
            message: error instanceof Error ? error.message : String(error),
        })
        throw new Error('pairing_device_key_unavailable')
    } finally {
        if (timeoutId) clearTimeout(timeoutId)
    }
}
