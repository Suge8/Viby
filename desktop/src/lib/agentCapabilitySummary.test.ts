import { describe, expect, it } from 'bun:test'
import type { RuntimeAgentCapabilitySnapshot } from '@viby/protocol'
import { getAgentCapabilitySummary } from './agentCapabilitySummary'
import { DESKTOP_COPY } from './desktopCopy'

function capability(models: RuntimeAgentCapabilitySnapshot['launchConfig']['config']['availableModels']) {
    return {
        driver: 'pi',
        availability: {
            driver: 'pi',
            value: null,
            detectedAt: null,
            expiresAt: null,
            refreshing: false,
            error: null,
        },
        launchConfig: {
            agent: 'pi',
            config: {
                agent: 'pi',
                defaultModel: 'openai/gpt-5',
                defaultModelReasoningEffort: 'high',
                availableModels: models,
            },
            detectedAt: 1,
            expiresAt: 2,
            refreshing: false,
            error: null,
        },
    } satisfies RuntimeAgentCapabilitySnapshot
}

describe('getAgentCapabilitySummary', () => {
    it('summarizes default model, model names and thinking levels', () => {
        expect(
            getAgentCapabilitySummary(
                DESKTOP_COPY.en,
                capability([
                    { id: 'm1', label: 'Model 1', supportedThinkingLevels: ['none', 'low'] },
                    { id: 'm2', label: 'Model 2', supportedThinkingLevels: ['high'] },
                ])
            )
        ).toBe('Default model: openai/gpt-5 · Models: Model 1, Model 2 · Thinking: low/high')
    })

    it('caps long model lists without losing count', () => {
        expect(
            getAgentCapabilitySummary(
                DESKTOP_COPY.en,
                capability([
                    { id: 'm1', label: 'M1', supportedThinkingLevels: [] },
                    { id: 'm2', label: 'M2', supportedThinkingLevels: [] },
                    { id: 'm3', label: 'M3', supportedThinkingLevels: [] },
                    { id: 'm4', label: 'M4', supportedThinkingLevels: [] },
                ])
            )
        ).toContain('Models: M1, M2, M3 +1')
    })
})
