import { describe, expect, it } from 'vitest'
import {
    getRemoteConnectingFallbackPhase,
    getRemoteConnectingPhaseProgress,
    getRemoteConnectingPhaseStepKey,
} from './remoteConnectingPhase'

describe('remoteConnectingPhase', () => {
    it('keeps progress monotonically increasing across phases', () => {
        const phases = [
            'opening-app',
            'recovering-device',
            'authenticating',
            'verifying-code',
            'opening-relay',
            'connecting-computer',
            'loading-workspace',
        ] as const
        const progress = phases.map(getRemoteConnectingPhaseProgress)
        expect(progress[0]).toBeGreaterThan(0)
        for (let index = 1; index < progress.length; index += 1) {
            expect(progress[index]).toBeGreaterThan(progress[index - 1])
        }
        expect(progress.at(-1)).toBeLessThan(1)
    })

    it('maps each phase to a step key', () => {
        expect(getRemoteConnectingPhaseStepKey('opening-app')).toBe('remotePairing.connecting.phase.openingApp')
        expect(getRemoteConnectingPhaseStepKey('verifying-code')).toBe('remotePairing.connecting.phase.verifyingCode')
        expect(getRemoteConnectingPhaseStepKey('loading-workspace')).toBe(
            'remotePairing.connecting.phase.loadingWorkspace'
        )
    })

    it('starts each attempt at the app opening phase', () => {
        expect(getRemoteConnectingFallbackPhase()).toBe('opening-app')
    })
})
