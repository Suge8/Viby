import { describe, expect, it } from 'vitest'
import { resolveEffectiveAgentLaunchPreferences, resolveEffectiveAgentSelection } from './newSessionAvailability'

describe('newSessionAvailability', () => {
    it('falls back to the first ready agent without mutating the saved agent choice', () => {
        const selection = resolveEffectiveAgentSelection('gemini', [
            {
                driver: 'claude',
                status: 'ready',
                resolution: 'none',
                code: 'ready',
                detectedAt: 1,
            },
            {
                driver: 'gemini',
                status: 'not_installed',
                resolution: 'install',
                code: 'command_missing',
                detectedAt: 1,
            },
        ])

        expect(selection).toMatchObject({
            rawAgent: 'gemini',
            effectiveAgent: 'claude',
            hasFallback: true,
        })
        expect(selection.rawAgentAvailability?.status).toBe('not_installed')
        expect(selection.effectiveAgentAvailability?.status).toBe('ready')
    })

    it('keeps per-agent model preferences attached to the effective launch agent', () => {
        const preferences = resolveEffectiveAgentLaunchPreferences(
            'claude',
            'gemini',
            { model: 'gemini-2.5-pro', modelReasoningEffort: 'high' },
            (agent) =>
                agent === 'claude'
                    ? { model: 'claude-sonnet-4.5', modelReasoningEffort: 'medium' }
                    : { model: 'gemini-2.5-pro', modelReasoningEffort: 'high' }
        )

        expect(preferences).toEqual({
            model: 'claude-sonnet-4.5',
            modelReasoningEffort: 'medium',
        })
    })
})
