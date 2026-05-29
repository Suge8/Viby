import type { PairingLanVerifyCodeResponse } from '@viby/protocol'
import { writeStoredDeviceBinding } from '@/hooks/deviceBindingStorage'
import { getAccessTokenStorageKey } from '@/lib/storage/storageRegistry'

/**
 * LAN verify-code result handler. Persists the hub-issued device binding
 * under the current origin's storage key so the next render of `useAuth`
 * exchanges it for a session token without further interaction.
 */
export function installLanDeviceBinding(auth: PairingLanVerifyCodeResponse): void {
    writeStoredDeviceBinding(getAccessTokenStorageKey(window.location.origin), {
        deviceId: auth.deviceId,
        secret: auth.deviceSecret,
    })
}
