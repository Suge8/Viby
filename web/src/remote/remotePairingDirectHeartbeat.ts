import {
    PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS,
    PAIRING_PEER_HEARTBEAT_INTERVAL_MS,
    type PairingPeerHeartbeat,
    PROTOCOL_VERSION,
} from '@viby/protocol'

const HEARTBEAT_STALE_TIMEOUT_GRACE_MS = PAIRING_PEER_HEARTBEAT_INTERVAL_MS

export type RemoteDirectHeartbeatFailureReason = 'heartbeat-missed' | 'send-failed'

export interface RemoteDirectHeartbeat {
    markAck: (channel: RTCDataChannel, heartbeat: PairingPeerHeartbeat) => number | null
    notifyForeground: () => void
    start: (channel: RTCDataChannel) => void
    stop: () => void
}

export function createRemoteDirectHeartbeat(options: {
    getChannel: () => RTCDataChannel | null
    getLastSeenSeq?: () => number
    onFailure: (reason: RemoteDirectHeartbeatFailureReason) => void
}): RemoteDirectHeartbeat {
    let intervalId: number | null = null
    let ackTimeoutId: number | null = null
    let sentAt: number | null = null

    function stop(): void {
        if (intervalId !== null) window.clearInterval(intervalId)
        if (ackTimeoutId !== null) window.clearTimeout(ackTimeoutId)
        intervalId = null
        ackTimeoutId = null
        sentAt = null
    }

    function resetAckTimeout(channel: RTCDataChannel): void {
        if (ackTimeoutId !== null) window.clearTimeout(ackTimeoutId)
        const deadline = Date.now() + PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS
        ackTimeoutId = window.setTimeout(() => {
            ackTimeoutId = null
            if (Date.now() - deadline > HEARTBEAT_STALE_TIMEOUT_GRACE_MS) return send(channel)
            if (options.getChannel() === channel) options.onFailure('heartbeat-missed')
        }, PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS)
    }

    function send(channel: RTCDataChannel): void {
        if (options.getChannel() !== channel || channel.readyState !== 'open') return
        const now = Date.now()
        const heartbeat: PairingPeerHeartbeat = {
            kind: 'heartbeat',
            protocolVersion: PROTOCOL_VERSION,
            sentAt: now,
            lastSeenSeq: options.getLastSeenSeq?.(),
        }
        try {
            channel.send(JSON.stringify(heartbeat))
            sentAt = now
            resetAckTimeout(channel)
        } catch {
            options.onFailure('send-failed')
        }
    }

    return {
        markAck(channel, heartbeat) {
            if (options.getChannel() !== channel || sentAt === null) return null
            if (typeof heartbeat.sentAt === 'number' && heartbeat.sentAt !== sentAt) return null
            const roundTripTimeMs = Math.max(0, Date.now() - sentAt)
            if (ackTimeoutId !== null) window.clearTimeout(ackTimeoutId)
            ackTimeoutId = null
            sentAt = null
            return roundTripTimeMs
        },
        notifyForeground() {
            const channel = options.getChannel()
            if (channel) send(channel)
        },
        start(channel) {
            stop()
            send(channel)
            intervalId = window.setInterval(() => send(channel), PAIRING_PEER_HEARTBEAT_INTERVAL_MS)
        },
        stop,
    }
}
