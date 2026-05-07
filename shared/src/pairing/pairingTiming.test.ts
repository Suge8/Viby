import { describe, expect, it } from 'bun:test'
import {
    PAIRING_CONNECT_TIMEOUT_MS,
    PAIRING_MOBILE_DISCONNECT_GRACE_MS,
    PAIRING_MOBILE_DISCONNECT_GRACE_SECONDS,
    PAIRING_SIGNAL_PING_INTERVAL_MS,
} from './pairingTiming'

describe('pairingTiming', () => {
    it('keeps mobile recovery longer than connection probing windows', () => {
        expect(PAIRING_MOBILE_DISCONNECT_GRACE_SECONDS).toBe(600)
        expect(PAIRING_MOBILE_DISCONNECT_GRACE_MS).toBe(600_000)
        expect(PAIRING_CONNECT_TIMEOUT_MS).toBeGreaterThan(PAIRING_SIGNAL_PING_INTERVAL_MS)
        expect(PAIRING_MOBILE_DISCONNECT_GRACE_MS).toBeGreaterThan(PAIRING_CONNECT_TIMEOUT_MS)
    })
})
