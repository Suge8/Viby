import { describe, expect, it } from 'vitest'
import { resolveEffectiveAgentSelection } from './newSessionAvailability'

describe('newSessionAvailability', () => {
    it('falls back to the first selectable agent without mutating the saved agent choice', () => {
        const selection = resolveEffectiveAgentSelection('gemini', {
            agents: [
                {
                    agent: 'claude',
                    modelOptions: [{ value: 'opus', label: 'Opus' }],
                    reasoningOptionsByModel: { opus: [] },
                },
            ],
            unavailable: { gemini: 'missing_model_options' },
        })

        expect(selection).toEqual({
            rawAgent: 'gemini',
            effectiveAgent: 'claude',
            rawAgentUnavailable: true,
            hasFallback: true,
        })
    })
})
