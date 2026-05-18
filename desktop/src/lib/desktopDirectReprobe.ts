import {
    type PairingTransportHandle,
    type PairingTunnelRouteState,
    shouldReprobePairingDirect,
} from '@viby/protocol/pairing'

type DesktopDirectReprobeOptions = {
    attachChannel(channel: RTCDataChannel): void
    channel: RTCDataChannel | null
    force?: boolean
    routeState: PairingTunnelRouteState
    transport: PairingTransportHandle | null
}

export function reprobeDesktopDirect(options: DesktopDirectReprobeOptions): void {
    const { attachChannel, channel, force = false, routeState, transport } = options
    if (!transport || (!force && !shouldReprobePairingDirect(routeState))) return
    const peer = transport.getPeer() as unknown as RTCPeerConnection
    if (peer.connectionState !== 'closed' && channel?.readyState !== 'open' && channel?.readyState !== 'connecting') {
        attachChannel(peer.createDataChannel('control', { ordered: true }))
    }
    transport.requestIceRestart()
}
