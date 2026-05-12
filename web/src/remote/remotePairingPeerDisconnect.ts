import { PAIRING_PEER_DISCONNECT_CLIENT_GRACE_MS } from '@viby/protocol'

export const PEER_DISCONNECTED_GRACE_MS = PAIRING_PEER_DISCONNECT_CLIENT_GRACE_MS

export function createPeerDisconnectGrace(options: {
    getConnectionState: () => RTCPeerConnectionState
    onExpired: () => void
}) {
    let timer: number | null = null

    function clear(): void {
        if (timer !== null) {
            window.clearTimeout(timer)
        }
        timer = null
    }

    function schedule(): void {
        if (timer !== null) {
            return
        }
        timer = window.setTimeout(() => {
            timer = null
            if (options.getConnectionState() !== 'connected') {
                options.onExpired()
            }
        }, PEER_DISCONNECTED_GRACE_MS)
    }

    return { clear, schedule }
}
