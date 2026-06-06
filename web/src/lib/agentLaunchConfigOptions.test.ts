import { describe, expect, it } from 'vitest'
import { getPiComposerModelOptions, getPiComposerReasoningEffortOptions } from './sessionConfigOptions'

describe('agent launch config options', () => {
    it('keeps Pi composer options provider-owned', () => {
        expect(
            getPiComposerModelOptions('openai/gpt-5.4', [
                { id: 'openai/gpt-5.4', label: 'GPT-5.4', supportedThinkingLevels: ['none', 'high'] },
            ])
        ).toEqual([
            { value: null, label: 'Terminal default model', labelKey: 'model.terminalDefault' },
            { value: 'openai/gpt-5.4', label: 'GPT-5.4' },
        ])
        expect(getPiComposerReasoningEffortOptions('high', ['none', 'high']).map((option) => option.value)).toEqual([
            null,
            'none',
            'high',
        ])
    })
})
