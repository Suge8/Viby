import { PAIRING_TUNNEL_READY_TIMEOUT_MS } from '@viby/protocol/pairing'
import { RemotePeerConnectError } from './remotePairingErrors'

export function startRemotePeerReadyTimeout(isReady: () => boolean, fail: (error: Error) => void): () => void {
    const timer = setTimeout(() => {
        if (!isReady()) fail(new RemotePeerConnectError('host-unavailable', 'remotePairing.error.closedRetrying'))
    }, PAIRING_TUNNEL_READY_TIMEOUT_MS)
    return () => clearTimeout(timer)
}
