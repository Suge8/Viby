import { describe, expect, it } from 'vitest'
import { getNewSessionStartBlockReason } from './newSessionStartReadiness'

const READY_INPUT = {
    agent: 'claude' as const,
    model: 'opus',
    modelReasoningEffort: null,
    hasDirectory: true,
    missingWorktreeDirectory: false,
    agentAvailabilityLoading: false,
    launchConfigBusy: false,
    launchConfigUnavailable: false,
    agentReady: true,
}

describe('getNewSessionStartBlockReason', () => {
    it('blocks while agent launch options are loading', () => {
        expect(getNewSessionStartBlockReason({ ...READY_INPUT, launchConfigBusy: true })).toBe('detectingAgents')
        expect(getNewSessionStartBlockReason({ ...READY_INPUT, launchConfigUnavailable: true })).toBe(
            'modelConfigUnavailable'
        )
    })

    it('requires a concrete selected model', () => {
        expect(getNewSessionStartBlockReason({ ...READY_INPUT, model: '' })).toBe('noReadyAgent')
    })
})
