import { PAIRING_BOOT_STUCK_RESCUE_MS, PAIRING_REMOTE_RECONNECT_MAX_ATTEMPTS } from '@viby/protocol'
import { describe, expect, it } from 'vitest'
import { shouldGiveUpRemoteReconnect, shouldRequestRemoteForegroundReconnect } from './remotePairingReconnectLoop'

describe('remotePairingReconnectLoop', () => {
    it('foreground always rescues the reconnecting and error states immediately', () => {
        const base = { bootStartedAt: 0, now: 0 }
        expect(shouldRequestRemoteForegroundReconnect({ state: { kind: 'reconnecting' }, ...base })).toBe(true)
        // After max attempts the loop drops to `error`; foreground/network
        // pulses must keep being able to drive a fresh attempt instead of
        // leaving the user stranded on the rescan screen.
        expect(shouldRequestRemoteForegroundReconnect({ state: { kind: 'error' }, ...base })).toBe(true)
    })

    it('foreground ignores stable or user-visible states', () => {
        const base = { bootStartedAt: 0, now: 0 }
        expect(shouldRequestRemoteForegroundReconnect({ state: { kind: 'approval' }, ...base })).toBe(false)
        expect(shouldRequestRemoteForegroundReconnect({ state: { kind: 'ready' }, ...base })).toBe(false)
    })

    it('gives up after the bounded reconnect budget', () => {
        expect(shouldGiveUpRemoteReconnect(PAIRING_REMOTE_RECONNECT_MAX_ATTEMPTS - 1)).toBe(false)
        expect(shouldGiveUpRemoteReconnect(PAIRING_REMOTE_RECONNECT_MAX_ATTEMPTS)).toBe(true)
    })

    it('foreground rescues booting after the stuck threshold so users never sit on a frozen connect', () => {
        const bootStartedAt = 1000
        const withinThreshold = bootStartedAt + PAIRING_BOOT_STUCK_RESCUE_MS - 1
        const pastThreshold = bootStartedAt + PAIRING_BOOT_STUCK_RESCUE_MS + 1

        expect(
            shouldRequestRemoteForegroundReconnect({
                state: { kind: 'booting' },
                bootStartedAt,
                now: withinThreshold,
            })
        ).toBe(false)
        expect(
            shouldRequestRemoteForegroundReconnect({
                state: { kind: 'booting' },
                bootStartedAt,
                now: pastThreshold,
            })
        ).toBe(true)
    })
})
