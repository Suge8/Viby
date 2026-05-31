import type { PairingPeerTextSender, PairingTunnelRouteState } from '@viby/protocol/pairing'
import { REMOTE_DIRECT_TEXT_CHUNK_BYTES } from './remotePairingDirectTextSender'
import type { RemotePeerMessageSender } from './remotePairingPendingRequests'
import type { RemotePairingRelaySocket } from './remotePairingRelaySocket'

const textEncoder = new TextEncoder()

type RemotePeerSessionSenderOptions = {
    routeState: PairingTunnelRouteState
    directChannelReady: boolean
    channel: RTCDataChannel | null
    directTextSender: PairingPeerTextSender | null
    relay: RemotePairingRelaySocket
    route?: 'direct' | 'relay'
}

export function createRemotePeerSessionSender(options: RemotePeerSessionSenderOptions): RemotePeerMessageSender | null {
    const { channel, directChannelReady, directTextSender, relay, routeState } = options
    if (routeState.phase !== 'ready') return null

    const route = options.route ?? routeState.activeRoute
    if (route === 'direct' && directChannelReady && channel?.readyState === 'open' && directTextSender) {
        return {
            readyState: channel.readyState,
            route: 'direct',
            sendText: (data, priority) =>
                directTextSender.send(data, { chunkBytes: REMOTE_DIRECT_TEXT_CHUNK_BYTES, priority }),
        }
    }

    if (route !== 'relay' || relay.readyState !== 'open') return null
    return {
        readyState: relay.readyState,
        route: 'relay',
        sendText: (data) => {
            relay.send(data)
            return Promise.resolve({ bytes: textEncoder.encode(data).byteLength, chunks: 1 })
        },
    }
}
