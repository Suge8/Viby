import { PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS, PAIRING_PEER_HEARTBEAT_INTERVAL_MS } from '@viby/protocol'

const HEARTBEAT_FRAME = JSON.stringify({ kind: 'heartbeat' })

type DataChannelHealthOptions = {
    getChannel: () => RTCDataChannel | null
    onStale: () => void
}

export function createRemotePairingDataChannelHealth(options: DataChannelHealthOptions) {
    let intervalId: number | null = null
    let ackTimeoutId: number | null = null

    function clearAckTimeout(): void {
        if (ackTimeoutId !== null) window.clearTimeout(ackTimeoutId)
        ackTimeoutId = null
    }

    function armAckTimeout(): void {
        clearAckTimeout()
        ackTimeoutId = window.setTimeout(() => {
            ackTimeoutId = null
            options.onStale()
        }, PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS)
    }

    function sendHeartbeat(): boolean {
        const channel = options.getChannel()
        if (channel?.readyState !== 'open') return false
        try {
            channel.send(HEARTBEAT_FRAME)
            armAckTimeout()
            return true
        } catch {
            clearAckTimeout()
            options.onStale()
            return false
        }
    }

    function start(): boolean {
        stop()
        const healthy = sendHeartbeat()
        if (healthy) intervalId = window.setInterval(sendHeartbeat, PAIRING_PEER_HEARTBEAT_INTERVAL_MS)
        return healthy
    }

    function stop(): void {
        if (intervalId !== null) window.clearInterval(intervalId)
        intervalId = null
        clearAckTimeout()
    }

    function noteInbound(): void {
        clearAckTimeout()
    }

    return { noteInbound, sendHeartbeat, start, stop }
}
