import { describe, expect, it } from 'vitest'
import { resolvePiModel, toPiModelCapabilities } from './launchConfig'

describe('Pi launch config helpers', () => {
    it('resolves provider-qualified and bare model selections', () => {
        const models = [
            { provider: 'openai-codex', id: 'gpt-5.5', name: 'GPT-5.5' },
            { provider: 'rc', id: 'gpt-5.5', name: 'GPT-5.5' },
        ]

        expect(resolvePiModel(models, 'openai-codex/gpt-5.5')).toBe(models[0])
        expect(resolvePiModel(models, 'gpt-5.5')).toBe(models[0])
    })

    it('rejects unknown local Pi runtime models', () => {
        expect(() => resolvePiModel([], 'rc/gpt-5.5')).toThrow('Pi model not found in local Pi runtime')
    })

    it('keeps duplicate Pi model names provider-qualified in launch metadata', () => {
        const result = toPiModelCapabilities([
            { provider: 'openai-codex', id: 'gpt-5.5', name: 'GPT-5.5', reasoning: true },
            { provider: 'rc', id: 'gpt-5.5', name: 'GPT-5.5', reasoning: true },
        ])

        expect(result.map(({ id, label }) => ({ id, label }))).toEqual([
            { id: 'openai-codex/gpt-5.5', label: 'GPT-5.5 (openai-codex)' },
            { id: 'rc/gpt-5.5', label: 'GPT-5.5 (rc)' },
        ])
    })
})
