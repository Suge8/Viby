import { reportWebRuntimeError } from '@/lib/runtimeDiagnostics'
import { setRetainedReady } from '@/remote/RemotePairingPersistence'

export function persistRemotePairingReady(pairingId: string): void {
    void setRetainedReady(pairingId, Date.now()).catch((error) => {
        reportWebRuntimeError('Failed to persist remote pairing ready marker.', error)
    })
}
