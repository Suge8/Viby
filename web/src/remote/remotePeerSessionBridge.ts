import type { PairingPeerRequest, PairingPeerTerminalEventPayload } from '@viby/protocol'
import type { SyncEvent } from '@/types/api'
import { uploadRemoteFile } from './remotePairingBinaryUpload'
import { createRemotePeerBridge } from './remotePairingBridge'
import type { RemotePeerBridge } from './remotePairingBridgeTypes'

export function createRemotePeerSessionBridge(options: {
    close: () => void
    closeListeners: Set<(error: Error) => void>
    getChannel: () => RTCDataChannel | null
    getFatalError: () => Error | null
    getTransportStats: RemotePeerBridge['getTransportStats']
    requestPeer: <T>(request: PairingPeerRequest, parse: (value: unknown) => T) => Promise<T>
    syncListeners: Set<(event: SyncEvent) => void>
    terminalListeners: Set<(event: PairingPeerTerminalEventPayload) => void>
}): RemotePeerBridge {
    return createRemotePeerBridge({
        requestPeer: options.requestPeer,
        subscribe: (listener) => {
            options.syncListeners.add(listener)
            return () => options.syncListeners.delete(listener)
        },
        subscribeTerminal: (listener) => {
            options.terminalListeners.add(listener)
            return () => options.terminalListeners.delete(listener)
        },
        onClose: (listener) => {
            const error = options.getFatalError()
            if (error) {
                listener(error)
                return () => false
            }
            options.closeListeners.add(listener)
            return () => options.closeListeners.delete(listener)
        },
        close: options.close,
        getTransportStats: options.getTransportStats,
        uploadFile: (sessionId, file, mimeType) =>
            uploadRemoteFile({
                channel: options.getChannel(),
                requestPeer: options.requestPeer,
                sessionId,
                file,
                mimeType,
            }),
    })
}
