import { describe, expect, it } from 'vitest'
import { shouldRequestRemoteForegroundReconnect } from './remotePairingReconnectLoop'

describe('remotePairingReconnectLoop', () => {
    it('foreground retries only the transient reconnect state', () => {
        expect(shouldRequestRemoteForegroundReconnect({ kind: 'reconnecting' })).toBe(true)
        expect(shouldRequestRemoteForegroundReconnect({ kind: 'approval' })).toBe(false)
        expect(shouldRequestRemoteForegroundReconnect({ kind: 'error' })).toBe(false)
        expect(shouldRequestRemoteForegroundReconnect({ kind: 'ready' })).toBe(false)
    })
})
