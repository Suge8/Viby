import { PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS, PROTOCOL_VERSION } from '@viby/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRemoteRelayHeartbeat } from './remotePairingRelayHeartbeat'
import type { RemotePairingRelaySocket } from './remotePairingRelaySocket'

function createRelay(): RemotePairingRelaySocket & { sent: string[] } {
    const sent: string[] = []
    return {
        readyState: 'open',
        sent,
        dispose: vi.fn(),
        notifyForeground: vi.fn(),
        send(data: string) {
            sent.push(data)
        },
        sendBinaryChunk: vi.fn(async () => undefined),
    }
}

describe('remotePairingRelayHeartbeat', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('measures relay round-trip time from echoed heartbeat frames', () => {
        const relay = createRelay()
        const heartbeat = createRemoteRelayHeartbeat({ getRelay: () => relay })

        heartbeat.start()
        vi.advanceTimersByTime(123)

        expect(relay.sent).toEqual([JSON.stringify({ kind: 'heartbeat', protocolVersion: PROTOCOL_VERSION })])
        expect(heartbeat.markAck()).toBe(123)

        heartbeat.stop()
    })

    it('does not stack foreground sends while one heartbeat is pending', () => {
        const relay = createRelay()
        const heartbeat = createRemoteRelayHeartbeat({ getRelay: () => relay })

        heartbeat.start()
        heartbeat.notifyForeground()

        expect(relay.sent).toHaveLength(1)

        heartbeat.stop()
    })

    it('emits one timeout event for a missed relay ack deadline', () => {
        const relay = createRelay()
        const onTimeout = vi.fn()
        const heartbeat = createRemoteRelayHeartbeat({ getRelay: () => relay, onTimeout })

        heartbeat.start()
        vi.advanceTimersByTime(PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS)

        expect(onTimeout).toHaveBeenCalledTimes(1)
        expect(heartbeat.markAck()).toBeNull()

        heartbeat.stop()
    })
})
