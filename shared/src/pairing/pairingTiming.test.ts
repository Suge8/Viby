import { describe, expect, it } from 'bun:test'
import {
    PAIRING_BOOT_STUCK_RESCUE_MS,
    PAIRING_CONNECT_TIMEOUT_MS,
    PAIRING_DESKTOP_TRANSPORT_RECOVERY_MS,
    PAIRING_FOREGROUND_LIVENESS_PROBE_TIMEOUT_MS,
    PAIRING_MOBILE_DISCONNECT_GRACE_MS,
    PAIRING_MOBILE_DISCONNECT_GRACE_SECONDS,
    PAIRING_PEER_DISCONNECT_CLIENT_GRACE_MS,
    PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS,
    PAIRING_PEER_HEARTBEAT_INTERVAL_MS,
    PAIRING_REMOTE_RECONNECT_MAX_ATTEMPTS,
    PAIRING_REMOTE_RECONNECT_MAX_DELAY_MS,
    PAIRING_SIGNAL_FOREGROUND_JOIN_ACK_TIMEOUT_MS,
    PAIRING_SIGNAL_PING_INTERVAL_MS,
} from './pairingTiming'

describe('pairingTiming', () => {
    it('keeps server-side mobile recovery generous so reconnects work after long backgrounds', () => {
        expect(PAIRING_MOBILE_DISCONNECT_GRACE_SECONDS).toBe(600)
        expect(PAIRING_MOBILE_DISCONNECT_GRACE_MS).toBe(600_000)
    })

    it('keeps client-side detection windows aggressive so reconnects never feel stuck', () => {
        // Initial peer connect must surface failures within 20s so the UI can retry quickly.
        expect(PAIRING_CONNECT_TIMEOUT_MS).toBeLessThanOrEqual(20_000)
        // Client-side disconnect grace must give a cellular ICE round enough
        // runway to re-select a candidate (TURN re-handshake is ~10s in the
        // worst case) but still fail fast enough to drop a truly dead
        // transport before the user notices.
        expect(PAIRING_PEER_DISCONNECT_CLIENT_GRACE_MS).toBeGreaterThanOrEqual(10_000)
        expect(PAIRING_PEER_DISCONNECT_CLIENT_GRACE_MS).toBeLessThanOrEqual(20_000)
        // Foreground probe responds in seconds, not the 10-minute server grace.
        expect(PAIRING_FOREGROUND_LIVENESS_PROBE_TIMEOUT_MS).toBeLessThanOrEqual(5_000)
        // Boot rescue triggers before users perceive the connect as stuck.
        expect(PAIRING_BOOT_STUCK_RESCUE_MS).toBeLessThanOrEqual(8_000)
        // Reconnect backoff stays bounded so retries don't pile on top of
        // each other faster than NAT/TURN can settle.
        expect(PAIRING_REMOTE_RECONNECT_MAX_DELAY_MS).toBeLessThanOrEqual(10_000)
        // Attempts must cover a full Wi-Fi <-> cellular handover plus a slow
        // initial WebRTC negotiation; 3 was too low for real mobile networks.
        expect(PAIRING_REMOTE_RECONNECT_MAX_ATTEMPTS).toBeGreaterThanOrEqual(10)
        expect(PAIRING_REMOTE_RECONNECT_MAX_ATTEMPTS).toBeLessThanOrEqual(20)
    })

    it('keeps client/desktop detection windows well below the server-side session grace', () => {
        expect(PAIRING_PEER_DISCONNECT_CLIENT_GRACE_MS).toBeLessThan(PAIRING_MOBILE_DISCONNECT_GRACE_MS)
        expect(PAIRING_DESKTOP_TRANSPORT_RECOVERY_MS).toBeLessThan(PAIRING_MOBILE_DISCONNECT_GRACE_MS)
        expect(PAIRING_FOREGROUND_LIVENESS_PROBE_TIMEOUT_MS).toBeLessThan(PAIRING_SIGNAL_PING_INTERVAL_MS)
        expect(PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS).toBeLessThan(PAIRING_PEER_HEARTBEAT_INTERVAL_MS)
        expect(PAIRING_SIGNAL_FOREGROUND_JOIN_ACK_TIMEOUT_MS).toBeLessThan(PAIRING_FOREGROUND_LIVENESS_PROBE_TIMEOUT_MS)
    })
})
