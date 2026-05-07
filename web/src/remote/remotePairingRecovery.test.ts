import { describe, expect, it } from 'vitest'
import { RemotePairingHttpError } from './remotePairingHttp'
import {
    getRemoteReconnectDelay,
    isRecoverableRemotePairingError,
    REMOTE_RECONNECT_MAX_DELAY_MS,
} from './remotePairingRecovery'
import { RemotePeerConnectError } from './remotePairingSignal'

describe('remotePairingRecovery', () => {
    it('caps reconnect backoff without losing the first retry window', () => {
        expect(getRemoteReconnectDelay(0)).toBe(750)
        expect(getRemoteReconnectDelay(1)).toBe(1_500)
        expect(getRemoteReconnectDelay(20)).toBe(REMOTE_RECONNECT_MAX_DELAY_MS)
    })

    it('keeps transient transport and broker failures in the reconnect path', () => {
        expect(
            isRecoverableRemotePairingError(new RemotePeerConnectError('socket', 'remotePairing.error.socket'))
        ).toBe(true)
        expect(
            isRecoverableRemotePairingError(new RemotePeerConnectError('closed', 'remotePairing.error.closed'))
        ).toBe(true)
        expect(isRecoverableRemotePairingError(new RemotePairingHttpError(503, 'remotePairing.error.fallback'))).toBe(
            true
        )
        expect(isRecoverableRemotePairingError(new TypeError('network'))).toBe(true)
    })

    it('does not retry expired or invalid credentials forever', () => {
        expect(
            isRecoverableRemotePairingError(new RemotePeerConnectError('expired', 'remotePairing.error.expired'))
        ).toBe(false)
        expect(
            isRecoverableRemotePairingError(new RemotePeerConnectError('host-closed', 'remotePairing.error.hostClosed'))
        ).toBe(false)
        expect(isRecoverableRemotePairingError(new RemotePairingHttpError(403, 'remotePairing.error.scanAgain'))).toBe(
            false
        )
        expect(isRecoverableRemotePairingError(new Error('missing token'))).toBe(false)
    })
})
