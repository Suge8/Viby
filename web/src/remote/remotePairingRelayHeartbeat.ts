import {
    PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS,
    PAIRING_PEER_HEARTBEAT_INTERVAL_MS,
    type PairingPeerHeartbeat,
} from '@viby/protocol'
import type { RemotePairingRelaySocket } from './remotePairingRelaySocket'

export interface RemoteRelayHeartbeat {
    markAck(): number | null
    notifyForeground(): void
    start(): void
    stop(): void
}

export function createRemoteRelayHeartbeat(options: {
    getRelay: () => RemotePairingRelaySocket
}): RemoteRelayHeartbeat {
    let intervalId: number | null = null
    let sentAt: number | null = null

    function send(): void {
        const now = Date.now()
        if (sentAt !== null && now - sentAt < PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS) return
        const relay = options.getRelay()
        if (relay.readyState !== 'open') return
        const heartbeat: PairingPeerHeartbeat = { kind: 'heartbeat' }
        sentAt = now
        try {
            relay.send(JSON.stringify(heartbeat))
        } catch {
            sentAt = null
        }
    }

    return {
        markAck() {
            if (sentAt === null) return null
            const rtt = Date.now() - sentAt
            sentAt = null
            return rtt
        },
        notifyForeground: send,
        start() {
            this.stop()
            send()
            intervalId = window.setInterval(send, PAIRING_PEER_HEARTBEAT_INTERVAL_MS)
        },
        stop() {
            if (intervalId !== null) window.clearInterval(intervalId)
            intervalId = null
            sentAt = null
        },
    }
}
