import { isProtocolVersionCompatible, type PairingPeerHeartbeat, resolvePeerProtocolVersion } from '@viby/protocol'
import { createRemotePairingCodedError } from './remotePairingErrors'
import type { RemoteRelayHeartbeat } from './remotePairingRelayHeartbeat'
import type { RemotePairingRelaySocket } from './remotePairingRelaySocket'

export function handleRemotePeerSessionRouteHeartbeat(options: {
    channel?: RTCDataChannel
    fail: (error: Error) => void
    heartbeat: PairingPeerHeartbeat
    handleDirectAck: (channel: RTCDataChannel, heartbeat: PairingPeerHeartbeat) => void
    maybeReprobeDirect: () => void
    relay: RemotePairingRelaySocket
    relayHeartbeat: RemoteRelayHeartbeat
    route: 'direct' | 'relay'
    commitRelayAck: (roundTripTimeMs: number | null, sampledAt: number) => void
}): void {
    if (!isProtocolVersionCompatible(resolvePeerProtocolVersion(options.heartbeat.protocolVersion))) {
        options.fail(createRemotePairingCodedError('remotePairing.error.updateDesktop'))
        return
    }
    if (!options.heartbeat.ack) {
        const payload = JSON.stringify({ ...options.heartbeat, ack: true })
        if (options.route === 'direct' && options.channel?.readyState === 'open') options.channel.send(payload)
        else if (options.route === 'relay' && options.relay.readyState === 'open') options.relay.send(payload)
        return
    }
    if (options.route === 'direct' && options.channel) {
        options.handleDirectAck(options.channel, options.heartbeat)
        return
    }
    options.commitRelayAck(options.relayHeartbeat.markAck(), Date.now())
    options.maybeReprobeDirect()
}
