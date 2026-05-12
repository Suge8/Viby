import { PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS, PAIRING_PEER_HEARTBEAT_INTERVAL_MS } from '@viby/protocol/pairing'

const STALE_DATA_CHANNEL_MS = PAIRING_PEER_HEARTBEAT_INTERVAL_MS + PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS

type ChannelHealthOptions = { onStale: () => void; staleMs?: number }

export function createPairingBridgeChannelHealth(options: ChannelHealthOptions) {
    let staleTimer: ReturnType<typeof setTimeout> | null = null
    let healthy = false

    function clearTimer(): void {
        if (staleTimer) clearTimeout(staleTimer)
        staleTimer = null
    }

    function arm(): void {
        clearTimer()
        staleTimer = setTimeout(() => {
            staleTimer = null
            healthy = false
            options.onStale()
        }, options.staleMs ?? STALE_DATA_CHANNEL_MS)
    }

    function start(): void {
        healthy = false
        arm()
    }

    function noteInbound(): boolean {
        const activated = !healthy
        healthy = true
        arm()
        return activated
    }

    function stop(): void {
        healthy = false
        clearTimer()
    }

    return { isHealthy: () => healthy, noteInbound, start, stop }
}

export type PairingBridgeChannelHealth = ReturnType<typeof createPairingBridgeChannelHealth>
