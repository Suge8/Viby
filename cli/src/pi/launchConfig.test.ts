import { describe, expect, it } from 'vitest'
import { resolvePiScopedModelContext } from './launchConfig'

describe('resolvePiScopedModelContext', () => {
    it('derives scoped Pi model capabilities from enabled model patterns', () => {
        const models = [
            {
                provider: 'openai',
                id: 'gpt-5.4',
                name: 'GPT-5.4',
                reasoning: true,
            },
            {
                provider: 'anthropic',
                id: 'claude-sonnet-4',
                name: 'Claude Sonnet 4',
                reasoning: false,
            },
        ] as unknown as Parameters<typeof resolvePiScopedModelContext>[0]

        const result = resolvePiScopedModelContext(models, ['openai/gpt-5.4:high', 'anthropic/claude-sonnet-4'])

        expect(result.scopeEnabled).toBe(true)
        expect(result.effectiveSelectablePiModels).toEqual(models)
        expect(result.piModelCapabilities).toEqual([
            {
                id: 'openai/gpt-5.4',
                label: 'GPT-5.4',
                supportedThinkingLevels: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
                defaultThinkingLevel: 'high',
            },
            {
                id: 'anthropic/claude-sonnet-4',
                label: 'Claude Sonnet 4',
                supportedThinkingLevels: ['none'],
            },
        ])
    })

    it('falls back to all authenticated models when scope is empty', () => {
        const models = [
            {
                provider: 'openai',
                id: 'gpt-5.4',
                reasoning: true,
            },
        ] as unknown as Parameters<typeof resolvePiScopedModelContext>[0]

        const result = resolvePiScopedModelContext(models, undefined)

        expect(result.scopeEnabled).toBe(false)
        expect(result.effectiveSelectablePiModels).toEqual(models)
        expect(result.piModelCapabilities).toEqual([
            {
                id: 'openai/gpt-5.4',
                label: 'openai/gpt-5.4',
                supportedThinkingLevels: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
            },
        ])
    })
})
