import { describe, expect, it } from 'vitest'
import {
    getRemoteConnectingFallbackPhase,
    getRemoteConnectingPhaseProgress,
    getRemoteConnectingPhaseStepKey,
    getRemoteReconnectPhaseStepKey,
} from './remoteConnectingPhase'

describe('remoteConnectingPhase', () => {
    it('keeps progress monotonically increasing across phases', () => {
        const pairing = getRemoteConnectingPhaseProgress('pairing')
        const verify = getRemoteConnectingPhaseProgress('verify')
        const finalizing = getRemoteConnectingPhaseProgress('finalizing')
        expect(pairing).toBeGreaterThan(0)
        expect(verify).toBeGreaterThan(pairing)
        expect(finalizing).toBeGreaterThan(verify)
        expect(finalizing).toBeLessThan(1)
    })

    it('maps each phase to a step key', () => {
        expect(getRemoteConnectingPhaseStepKey('pairing')).toBe('remotePairing.connecting.phase.pairing')
        expect(getRemoteConnectingPhaseStepKey('verify')).toBe('remotePairing.connecting.phase.verify')
        expect(getRemoteConnectingPhaseStepKey('finalizing')).toBe('remotePairing.connecting.phase.finalizing')
    })

    it('uses reconnect-specific copy only for finalizing', () => {
        expect(getRemoteReconnectPhaseStepKey('pairing')).toBe('remotePairing.connecting.phase.pairing')
        expect(getRemoteReconnectPhaseStepKey('finalizing')).toBe('remotePairing.reconnectNotice.phase.finalizing')
    })

    it('starts each attempt at pairing', () => {
        expect(getRemoteConnectingFallbackPhase()).toBe('pairing')
    })
})
