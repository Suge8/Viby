import {
    PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS,
    PAIRING_PEER_HEARTBEAT_INTERVAL_MS,
    type PairingPeerHeartbeat,
} from '@viby/protocol'

const HEARTBEAT_STALE_TIMEOUT_GRACE_MS = PAIRING_PEER_HEARTBEAT_INTERVAL_MS

export type RemoteDirectHeartbeatFailureReason = 'heartbeat-missed' | 'send-failed'

export interface RemoteDirectHeartbeat {
    markAck: (channel: RTCDataChannel) => boolean
    notifyForeground: () => void
    start: (channel: RTCDataChannel) => void
    stop: () => void
}

export function createRemoteDirectHeartbeat(options: {
    getChannel: () => RTCDataChannel | null
    onFailure: (reason: RemoteDirectHeartbeatFailureReason) => void
}): RemoteDirectHeartbeat {
    let intervalId: number | null = null
    let ackTimeoutId: number | null = null

    function stop(): void {
        if (intervalId !== null) window.clearInterval(intervalId)
        if (ackTimeoutId !== null) window.clearTimeout(ackTimeoutId)
        intervalId = null
        ackTimeoutId = null
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
        const heartbeat: PairingPeerHeartbeat = { kind: 'heartbeat' }
        try {
            channel.send(JSON.stringify(heartbeat))
            resetAckTimeout(channel)
        } catch {
            options.onFailure('send-failed')
        }
    }

    return {
        markAck(channel) {
            if (options.getChannel() !== channel) return false
            if (ackTimeoutId !== null) window.clearTimeout(ackTimeoutId)
            ackTimeoutId = null
            return true
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
