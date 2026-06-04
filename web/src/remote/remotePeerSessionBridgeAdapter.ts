import type { PairingPeerRequest, PairingPeerTerminalEventPayload } from '@viby/protocol'
import type { PairingPeerTextSender, PairingTunnelRouteState } from '@viby/protocol/pairing'
import type { SyncEvent } from '@/types/api'
import type { RemotePeerBridge } from './remotePairingBridgeTypes'
import type { RemotePeerPendingRequests } from './remotePairingPendingRequests'
import type { RemotePairingRelaySocket } from './remotePairingRelaySocket'
import type { RemotePeerTransportStats } from './remotePairingStats'
import { createRemotePeerSessionBridge } from './remotePeerSessionBridge'
import { requestRemotePeer } from './remotePeerSessionRequest'

export function createRemotePeerSessionBridgeAdapter(options: {
    pendingRequests: RemotePeerPendingRequests
    getRouteState: () => PairingTunnelRouteState
    getDirectChannelReady: () => boolean
    getChannel: () => RTCDataChannel | null
    getDirectTextSender: () => PairingPeerTextSender | null
    getRelay: () => RemotePairingRelaySocket
    getFatalError: () => Error | null
    getTransportStats: () => Promise<RemotePeerTransportStats>
    close: () => void
    syncListeners: Set<(event: SyncEvent) => void>
    terminalListeners: Set<(event: PairingPeerTerminalEventPayload) => void>
    closeListeners: Set<(error: Error) => void>
}): RemotePeerBridge {
    return createRemotePeerSessionBridge({
        requestPeer: async <T>(request: PairingPeerRequest, parse: (value: unknown) => T) =>
            await requestRemotePeer(
                {
                    pendingRequests: options.pendingRequests,
                    routeState: options.getRouteState(),
                    directChannelReady: options.getDirectChannelReady(),
                    channel: options.getChannel(),
                    directTextSender: options.getDirectTextSender(),
                    relay: options.getRelay(),
                    getFatalError: options.getFatalError,
                },
                request,
                parse
            ),
        close: options.close,
        getTransportStats: options.getTransportStats,
        getChannel: options.getChannel,
        getRelay: options.getRelay,
        getFatalError: options.getFatalError,
        syncListeners: options.syncListeners,
        terminalListeners: options.terminalListeners,
        closeListeners: options.closeListeners,
    })
}
