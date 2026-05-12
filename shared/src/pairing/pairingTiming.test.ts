import { describe, expect, it } from 'bun:test'
import {
    computePairingReconnectDelay,
    PAIRING_DESKTOP_TRANSPORT_RECOVERY_MS,
    PAIRING_FOREGROUND_LIVENESS_PROBE_TIMEOUT_MS,
    PAIRING_MOBILE_DISCONNECT_GRACE_MS,
    PAIRING_MOBILE_DISCONNECT_GRACE_SECONDS,
    PAIRING_PEER_DISCONNECT_CLIENT_GRACE_MS,
    PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS,
    PAIRING_PEER_HEARTBEAT_INTERVAL_MS,
    PAIRING_REMOTE_RECONNECT_BASE_DELAY_MS,
    PAIRING_REMOTE_RECONNECT_JITTER_RATIO,
    PAIRING_REMOTE_RECONNECT_MAX_DELAY_MS,
    PAIRING_SIGNAL_FOREGROUND_JOIN_ACK_TIMEOUT_MS,
    PAIRING_SIGNAL_PING_INTERVAL_MS,
} from './pairingTiming'

describe('pairingTiming', () => {
    it('keeps server-side mobile recovery generous so reconnects work after long backgrounds', () => {
        expect(PAIRING_MOBILE_DISCONNECT_GRACE_SECONDS).toBe(600)
        expect(PAIRING_MOBILE_DISCONNECT_GRACE_MS).toBe(600_000)
    })

    it('uses permanent bounded exponential backoff with jitter', () => {
        expect(PAIRING_REMOTE_RECONNECT_BASE_DELAY_MS).toBe(300)
        expect(PAIRING_REMOTE_RECONNECT_MAX_DELAY_MS).toBe(10_000)
        expect(PAIRING_REMOTE_RECONNECT_JITTER_RATIO).toBe(0.15)
        expect(computePairingReconnectDelay(0, () => 0)).toBe(255)
        expect(computePairingReconnectDelay(0, () => 1)).toBe(345)
        expect(computePairingReconnectDelay(10, () => 1)).toBe(8_500)
        expect(computePairingReconnectDelay(10, () => 0)).toBe(10_000)
    })

    it('never produces blocking or invalid reconnect delays', () => {
        for (let attempt = 0; attempt < 1000; attempt += 1) {
            const delay = computePairingReconnectDelay(attempt, () => (attempt % 100) / 99)
            expect(Number.isFinite(delay)).toBe(true)
            expect(delay).toBeGreaterThan(0)
            expect(delay).toBeLessThanOrEqual(PAIRING_REMOTE_RECONNECT_MAX_DELAY_MS)
        }
    })

    it('keeps client/desktop detection windows below the server-side session grace', () => {
        expect(PAIRING_PEER_DISCONNECT_CLIENT_GRACE_MS).toBeLessThan(PAIRING_MOBILE_DISCONNECT_GRACE_MS)
        expect(PAIRING_DESKTOP_TRANSPORT_RECOVERY_MS).toBeLessThan(PAIRING_MOBILE_DISCONNECT_GRACE_MS)
        expect(PAIRING_FOREGROUND_LIVENESS_PROBE_TIMEOUT_MS).toBeLessThan(PAIRING_SIGNAL_PING_INTERVAL_MS)
        expect(PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS).toBeLessThan(PAIRING_PEER_HEARTBEAT_INTERVAL_MS)
        expect(PAIRING_SIGNAL_FOREGROUND_JOIN_ACK_TIMEOUT_MS).toBeLessThan(PAIRING_FOREGROUND_LIVENESS_PROBE_TIMEOUT_MS)
    })
})
