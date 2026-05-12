import { PAIRING_REMOTE_RECONNECT_MAX_ATTEMPTS } from '@viby/protocol'
import { describe, expect, it } from 'vitest'
import { shouldGiveUpRemoteReconnect } from './remotePairingReconnectLoop'

describe('remotePairingReconnectLoop', () => {
    it('gives up after the bounded reconnect budget', () => {
        expect(shouldGiveUpRemoteReconnect(PAIRING_REMOTE_RECONNECT_MAX_ATTEMPTS - 1)).toBe(false)
        expect(shouldGiveUpRemoteReconnect(PAIRING_REMOTE_RECONNECT_MAX_ATTEMPTS)).toBe(true)
    })
})
