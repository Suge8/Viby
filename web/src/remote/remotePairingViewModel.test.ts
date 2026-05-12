import { describe, expect, it } from 'vitest'
import {
    buildRemoteStatusSpec,
    shouldBlockRemoteReadyShellInteraction,
    shouldShowRemoteReconnectNotice,
} from './remotePairingViewModel'

describe('remotePairingViewModel', () => {
    it('shows reconnect chrome only while the retained workspace is running', () => {
        expect(shouldShowRemoteReconnectNotice({ kind: 'running' })).toBe(true)
        expect(shouldShowRemoteReconnectNotice({ kind: 'hydrating' })).toBe(false)
        expect(shouldShowRemoteReconnectNotice({ kind: 'first-pairing' })).toBe(false)
        expect(shouldShowRemoteReconnectNotice({ kind: 'fatal' })).toBe(false)
    })

    it('blocks workspace actions outside the running state', () => {
        expect(shouldBlockRemoteReadyShellInteraction({ kind: 'running' })).toBe(false)
        expect(shouldBlockRemoteReadyShellInteraction({ kind: 'hydrating' })).toBe(true)
        expect(shouldBlockRemoteReadyShellInteraction({ kind: 'fatal' })).toBe(true)
    })

    it('collapses status errors into a small surface set', () => {
        expect(buildRemoteStatusSpec(null)).toEqual({ messageKey: null, retry: false })
        expect(buildRemoteStatusSpec('remotePairing.error.scanAgain')).toEqual({
            messageKey: 'remotePairing.error.scanAgain',
            retry: false,
        })
        expect(buildRemoteStatusSpec('remotePairing.error.regenerateQr')).toEqual({
            messageKey: 'remotePairing.error.regenerateQr',
            retry: false,
        })
        expect(buildRemoteStatusSpec('remotePairing.error.closedRetrying')).toEqual({
            messageKey: 'remotePairing.error.closedRetrying',
            retry: true,
        })
    })
})
