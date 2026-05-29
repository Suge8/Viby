import {
    PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS,
    PAIRING_PEER_HEARTBEAT_INTERVAL_MS,
    type PairingPeerHeartbeat,
    PROTOCOL_VERSION,
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
    onTimeout?: () => void
}): RemoteRelayHeartbeat {
    let intervalId: number | null = null
    let timeoutId: number | null = null
    let sentAt: number | null = null

    function send(): void {
        const now = Date.now()
        if (sentAt !== null && now - sentAt < PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS) return
        const relay = options.getRelay()
        if (relay.readyState !== 'open') return
        const heartbeat: PairingPeerHeartbeat = { kind: 'heartbeat', protocolVersion: PROTOCOL_VERSION }
        sentAt = now
        try {
            relay.send(JSON.stringify(heartbeat))
            scheduleAckDeadline()
        } catch {
            sentAt = null
            clearAckDeadline()
        }
    }

    function scheduleAckDeadline(): void {
        clearAckDeadline()
        timeoutId = window.setTimeout(() => {
            timeoutId = null
            sentAt = null
            options.onTimeout?.()
        }, PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS)
    }

    function clearAckDeadline(): void {
        if (timeoutId !== null) window.clearTimeout(timeoutId)
        timeoutId = null
    }

    return {
        markAck() {
            if (sentAt === null) return null
            const rtt = Date.now() - sentAt
            sentAt = null
            clearAckDeadline()
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
            clearAckDeadline()
        },
    }
}
