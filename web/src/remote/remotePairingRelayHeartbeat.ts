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

type ScheduleInterval = (callback: () => void, intervalMs: number) => () => void
type ScheduleTimeout = (callback: () => void, delayMs: number) => () => void

export function createRemoteRelayHeartbeat(options: {
    getRelay: () => RemotePairingRelaySocket
    getLastSeenSeq?: () => number
    now?: () => number
    onTimeout?: () => void
    scheduleInterval?: ScheduleInterval
    scheduleTimeout?: ScheduleTimeout
}): RemoteRelayHeartbeat {
    const now = options.now ?? Date.now
    const scheduleInterval = options.scheduleInterval ?? defaultScheduleInterval
    const scheduleTimeout = options.scheduleTimeout ?? defaultScheduleTimeout
    let cancelInterval: (() => void) | null = null
    let cancelTimeout: (() => void) | null = null
    let sentAt: number | null = null

    function send(): void {
        const currentTime = now()
        if (sentAt !== null) {
            if (currentTime - sentAt < PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS) return
            expirePendingAck()
            return
        }
        const relay = options.getRelay()
        if (relay.readyState !== 'open') return
        const heartbeat: PairingPeerHeartbeat = {
            kind: 'heartbeat',
            protocolVersion: PROTOCOL_VERSION,
            lastSeenSeq: options.getLastSeenSeq?.(),
        }
        sentAt = currentTime
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
        cancelTimeout = scheduleTimeout(expirePendingAck, PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS)
    }

    function clearAckDeadline(): void {
        cancelTimeout?.()
        cancelTimeout = null
    }

    function expirePendingAck(): void {
        clearAckDeadline()
        if (sentAt === null) return
        sentAt = null
        options.onTimeout?.()
    }

    return {
        markAck() {
            if (sentAt === null) return null
            const rtt = now() - sentAt
            sentAt = null
            clearAckDeadline()
            return rtt
        },
        notifyForeground: send,
        start() {
            this.stop()
            send()
            cancelInterval = scheduleInterval(send, PAIRING_PEER_HEARTBEAT_INTERVAL_MS)
        },
        stop() {
            cancelInterval?.()
            cancelInterval = null
            sentAt = null
            clearAckDeadline()
        },
    }
}

function defaultScheduleTimeout(callback: () => void, delayMs: number): () => void {
    const timer = window.setTimeout(callback, delayMs)
    return () => window.clearTimeout(timer)
}

function defaultScheduleInterval(callback: () => void, intervalMs: number): () => void {
    const timer = window.setInterval(callback, intervalMs)
    return () => window.clearInterval(timer)
}
