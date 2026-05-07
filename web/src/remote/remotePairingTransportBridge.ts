import type { PairingPeerTerminalEventPayload } from '@viby/protocol'
import type { SyncEvent } from '@/types/api'
import { createRemotePeerBridge } from './remotePairingBridge'
import type { RemotePeerBridge, RemotePeerRequester } from './remotePairingBridgeTypes'

export function createRemotePeerTransportBridge(options: {
    requestPeer: RemotePeerRequester
    syncListeners: Set<(event: SyncEvent) => void>
    terminalListeners: Set<(event: PairingPeerTerminalEventPayload) => void>
    closeListeners: Set<(error: Error) => void>
    getCloseError: () => Error | null
    close: () => void
    getTransportStats: RemotePeerBridge['getTransportStats']
    uploadFile: RemotePeerBridge['uploadFile']
}): RemotePeerBridge {
    return createRemotePeerBridge({
        requestPeer: options.requestPeer,
        subscribe(listener) {
            options.syncListeners.add(listener)
            return () => options.syncListeners.delete(listener)
        },
        subscribeTerminal(listener) {
            options.terminalListeners.add(listener)
            return () => options.terminalListeners.delete(listener)
        },
        onClose(listener) {
            const closedError = options.getCloseError()
            if (closedError) {
                listener(closedError)
                return () => false
            }
            options.closeListeners.add(listener)
            return () => options.closeListeners.delete(listener)
        },
        close: options.close,
        getTransportStats: options.getTransportStats,
        uploadFile: options.uploadFile,
    })
}
