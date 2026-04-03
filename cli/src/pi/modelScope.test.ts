import { describe, expect, it } from 'vitest'
import { formatPiScopedModelId, resolvePiModelScope } from './modelScope'

const AVAILABLE_MODELS = [
    { provider: 'openai', id: 'gpt-5.4', name: 'GPT-5.4' },
    { provider: 'openai', id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini' },
    { provider: 'anthropic', id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
] as const

describe('resolvePiModelScope', () => {
    it('returns all available models when no enabledModels filter is configured', () => {
        expect(resolvePiModelScope(undefined, AVAILABLE_MODELS).map((selection) => formatPiScopedModelId(selection.model))).toEqual([
            'openai/gpt-5.4',
            'openai/gpt-5.4-mini',
            'anthropic/claude-sonnet-4-5',
        ])
        expect(resolvePiModelScope([], AVAILABLE_MODELS).map((selection) => formatPiScopedModelId(selection.model))).toEqual([
            'openai/gpt-5.4',
            'openai/gpt-5.4-mini',
            'anthropic/claude-sonnet-4-5',
        ])
    })

    it('supports exact bare-id filters', () => {
        expect(resolvePiModelScope(['gpt-5.4-mini'], AVAILABLE_MODELS)).toEqual([
            { model: AVAILABLE_MODELS[1] }
        ])
    })

    it('supports canonical provider/model filters', () => {
        expect(resolvePiModelScope(['openai/gpt-5.4'], AVAILABLE_MODELS)).toEqual([
            { model: AVAILABLE_MODELS[0] }
        ])
    })

    it('supports glob filters and preserves their order', () => {
        expect(resolvePiModelScope(['anthropic/*', 'openai/gpt-5.4-mini'], AVAILABLE_MODELS).map((selection) => formatPiScopedModelId(selection.model))).toEqual([
            'anthropic/claude-sonnet-4-5',
            'openai/gpt-5.4-mini',
        ])
    })

    it('parses optional thinking-level suffixes without changing model identity', () => {
        expect(resolvePiModelScope(['openai/*:high'], AVAILABLE_MODELS)).toEqual([
            { model: AVAILABLE_MODELS[0], thinkingLevel: 'high' },
            { model: AVAILABLE_MODELS[1], thinkingLevel: 'high' },
        ])
    })

    it('lets later rules override earlier broad matches for the same model', () => {
        expect(resolvePiModelScope([
            'openai/*:low',
            'openai/gpt-5.4:high',
            'anthropic/*:medium',
            'claude-sonnet-4-5:xhigh',
        ], AVAILABLE_MODELS)).toEqual([
            { model: AVAILABLE_MODELS[0], thinkingLevel: 'high' },
            { model: AVAILABLE_MODELS[1], thinkingLevel: 'low' },
            { model: AVAILABLE_MODELS[2], thinkingLevel: 'xhigh' },
        ])
    })
})
