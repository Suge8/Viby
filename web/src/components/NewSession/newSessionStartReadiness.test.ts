import { describe, expect, it } from 'vitest'
import { getNewSessionStartBlockReason } from './newSessionStartReadiness'

const READY_INPUT = {
    agent: 'claude' as const,
    model: 'auto',
    modelReasoningEffort: 'default' as const,
    hasDirectory: true,
    missingWorktreeDirectory: false,
    agentAvailabilityLoading: false,
    launchConfigBusy: false,
    launchConfigUnavailable: false,
    agentReady: true,
}

describe('getNewSessionStartBlockReason', () => {
    it('blocks Pi default startup until launch config is ready', () => {
        expect(getNewSessionStartBlockReason({ ...READY_INPUT, agent: 'pi', launchConfigBusy: true })).toBe(
            'detectingModelConfig'
        )
        expect(getNewSessionStartBlockReason({ ...READY_INPUT, agent: 'pi', launchConfigUnavailable: true })).toBe(
            'modelConfigUnavailable'
        )
    })

    it('does not block non-Pi default startup on background model config reads', () => {
        expect(getNewSessionStartBlockReason({ ...READY_INPUT, launchConfigBusy: true })).toBe(null)
        expect(getNewSessionStartBlockReason({ ...READY_INPUT, launchConfigUnavailable: true })).toBe(null)
    })

    it('blocks explicit model or reasoning overrides on launch config state', () => {
        expect(getNewSessionStartBlockReason({ ...READY_INPUT, model: 'opus', launchConfigBusy: true })).toBe(
            'detectingModelConfig'
        )
        expect(
            getNewSessionStartBlockReason({
                ...READY_INPUT,
                modelReasoningEffort: 'high',
                launchConfigUnavailable: true,
            })
        ).toBe('modelConfigUnavailable')
    })
})
