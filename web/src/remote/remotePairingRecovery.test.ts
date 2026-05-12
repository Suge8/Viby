import { describe, expect, it } from 'vitest'
import { BrowserStorageUnavailableError } from '@/lib/browserStorage'
import { AppCacheUnavailableError } from '@/lib/storage/appCacheDb'
import { APP_CACHE_STORES } from '@/lib/storage/storageRegistry'
import { createRemotePairingUserError, RemotePeerConnectError } from './remotePairingErrors'
import { RemotePairingHttpError } from './remotePairingHttp'
import {
    getRemoteReconnectDelay,
    isRecoverableRemotePairingError,
    REMOTE_RECONNECT_MAX_DELAY_MS,
} from './remotePairingRecovery'

describe('remotePairingRecovery', () => {
    it('caps reconnect backoff without losing the first retry window', () => {
        expect(getRemoteReconnectDelay(0)).toBe(300)
        expect(getRemoteReconnectDelay(1)).toBe(600)
        expect(getRemoteReconnectDelay(20)).toBe(REMOTE_RECONNECT_MAX_DELAY_MS)
    })

    it('keeps transient transport and broker failures in the reconnect path', () => {
        expect(
            isRecoverableRemotePairingError(new RemotePeerConnectError('socket', 'remotePairing.error.socket'))
        ).toBe(true)
        expect(
            isRecoverableRemotePairingError(new RemotePeerConnectError('closed', 'remotePairing.error.closed'))
        ).toBe(true)
        expect(
            isRecoverableRemotePairingError(new RemotePeerConnectError('p2p-blocked', 'remotePairing.error.p2pBlocked'))
        ).toBe(true)
        expect(
            isRecoverableRemotePairingError(
                new RemotePeerConnectError('host-unavailable', 'remotePairing.error.hostUnavailable')
            )
        ).toBe(true)
        expect(
            isRecoverableRemotePairingError(new RemotePeerConnectError('host-closed', 'remotePairing.error.hostClosed'))
        ).toBe(true)
        expect(isRecoverableRemotePairingError(new RemotePairingHttpError(503, 'remotePairing.error.fallback'))).toBe(
            true
        )
        expect(
            isRecoverableRemotePairingError(
                new RemotePairingHttpError(
                    403,
                    'remotePairing.error.scanAgain',
                    'Missing or expired reconnect challenge',
                    'pairing_reconnect_challenge_expired'
                )
            )
        ).toBe(true)
        expect(isRecoverableRemotePairingError(new TypeError('network'))).toBe(true)
    })

    it('does not retry terminal peer states or invalid credentials forever', () => {
        expect(
            isRecoverableRemotePairingError(new RemotePeerConnectError('expired', 'remotePairing.error.expired'))
        ).toBe(false)
        expect(
            isRecoverableRemotePairingError(
                new RemotePairingHttpError(
                    403,
                    'remotePairing.error.scanAgain',
                    'Invalid pairing token',
                    'pairing_invalid_token'
                )
            )
        ).toBe(false)
        expect(isRecoverableRemotePairingError(new Error('missing token'))).toBe(false)
    })

    it('retries explicit storage-unavailable errors but keeps regenerateQr terminal', () => {
        expect(isRecoverableRemotePairingError(new BrowserStorageUnavailableError('local', 'read'))).toBe(true)
        expect(
            isRecoverableRemotePairingError(
                new AppCacheUnavailableError('read', APP_CACHE_STORES.pairingDeviceKeys, 'pairing-1')
            )
        ).toBe(true)
        expect(isRecoverableRemotePairingError(createRemotePairingUserError('remotePairing.error.regenerateQr'))).toBe(
            false
        )
    })
})
