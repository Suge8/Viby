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
        const connecting = getRemoteConnectingPhaseProgress('connecting')
        const finalizing = getRemoteConnectingPhaseProgress('finalizing')

        expect(pairing).toBeGreaterThan(0)
        expect(verify).toBeGreaterThan(pairing)
        expect(connecting).toBeGreaterThan(verify)
        expect(finalizing).toBeGreaterThan(connecting)
        expect(finalizing).toBeLessThan(1)
    })

    it('maps each phase to a step key for the cold connecting surface', () => {
        expect(getRemoteConnectingPhaseStepKey('pairing')).toBe('remotePairing.connecting.phase.pairing')
        expect(getRemoteConnectingPhaseStepKey('verify')).toBe('remotePairing.connecting.phase.verify')
        expect(getRemoteConnectingPhaseStepKey('connecting')).toBe('remotePairing.connecting.phase.connecting')
        expect(getRemoteConnectingPhaseStepKey('finalizing')).toBe('remotePairing.connecting.phase.finalizing')
    })

    it('uses reconnect-specific copy on later phases of a reconnect attempt', () => {
        expect(getRemoteReconnectPhaseStepKey('connecting')).toBe('remotePairing.reconnectNotice.phase.connecting')
        expect(getRemoteReconnectPhaseStepKey('finalizing')).toBe('remotePairing.reconnectNotice.phase.finalizing')
    })

    it('falls back to the cold connecting copy when no reconnect-specific copy exists', () => {
        expect(getRemoteReconnectPhaseStepKey('pairing')).toBe('remotePairing.connecting.phase.pairing')
        expect(getRemoteReconnectPhaseStepKey('verify')).toBe('remotePairing.connecting.phase.verify')
    })

    it('starts a fresh attempt at pairing and a retry at the connecting phase', () => {
        expect(getRemoteConnectingFallbackPhase(0)).toBe('pairing')
        expect(getRemoteConnectingFallbackPhase(1)).toBe('connecting')
        expect(getRemoteConnectingFallbackPhase(5)).toBe('connecting')
    })
})
