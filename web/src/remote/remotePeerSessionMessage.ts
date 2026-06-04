import type { PairingPeerHeartbeat, PairingPeerTerminalEventPayload } from '@viby/protocol'
import type { PairingPeerTextAssembler } from '@viby/protocol/pairing'
import type { SyncEvent } from '@/types/api'
import { handleRemotePeerChannelMessage } from './remotePairingChannelMessages'
import type { RemotePairingEventSeq } from './remotePairingEventSeq'
import type { RemotePeerPendingRequests } from './remotePairingPendingRequests'
import type { RemoteRelayHeartbeat } from './remotePairingRelayHeartbeat'
import type { RemotePairingRelaySocket } from './remotePairingRelaySocket'
import { handleRemotePeerSessionRouteHeartbeat } from './remotePeerSessionRouteHeartbeat'

export function handleRemotePeerSessionMessage(options: {
    data: unknown
    route: 'direct' | 'relay'
    channel?: RTCDataChannel
    textAssembler: PairingPeerTextAssembler
    pendingRequests: RemotePeerPendingRequests
    syncListeners: Set<(event: SyncEvent) => void>
    terminalListeners: Set<(event: PairingPeerTerminalEventPayload) => void>
    acceptEventSeq: RemotePairingEventSeq['accept']
    fail: (error: Error) => void
    handleDirectAck: (channel: RTCDataChannel, heartbeat: PairingPeerHeartbeat) => void
    maybeReprobeDirect: () => void
    relay: RemotePairingRelaySocket
    relayHeartbeat: RemoteRelayHeartbeat
    commitRelayAck: (roundTripTimeMs: number | null, sampledAt: number) => void
}): void {
    handleRemotePeerChannelMessage({
        data: options.data,
        textAssembler: options.textAssembler,
        pendingRequests: options.pendingRequests,
        syncListeners: options.syncListeners,
        terminalListeners: options.terminalListeners,
        acceptEventSeq: options.acceptEventSeq,
        onHeartbeat: (heartbeat) => {
            handleRemotePeerSessionRouteHeartbeat({
                channel: options.channel,
                fail: options.fail,
                heartbeat,
                handleDirectAck: options.handleDirectAck,
                maybeReprobeDirect: options.maybeReprobeDirect,
                relay: options.relay,
                relayHeartbeat: options.relayHeartbeat,
                route: options.route,
                commitRelayAck: options.commitRelayAck,
            })
        },
    })
}
