import { describe, expect, it } from 'vitest'
import {
    getClaudeComposerReasoningEffortOptions,
    getCodexComposerReasoningEffortOptions,
    getPiComposerModelOptions,
    getPiComposerReasoningEffortOptions,
    getSessionModelDisplayLabelWithCapabilities,
} from './sessionConfigOptions'

describe('sessionConfigOptions', () => {
    it('labels provider capabilities without Web curated launch defaults', () => {
        expect(
            getSessionModelDisplayLabelWithCapabilities('openai/gpt-5.4', 'pi', [
                { id: 'openai/gpt-5.4', label: 'GPT-5.4', supportedThinkingLevels: [] },
            ])
        ).toBe('GPT-5.4')
    })

    it('keeps Pi composer model options from session capability', () => {
        expect(getPiComposerModelOptions(null, [])).toEqual([])
        expect(
            getPiComposerModelOptions('openai/gpt-5.4-mini', [
                { id: 'openai/gpt-5.4', label: 'GPT-5.4', supportedThinkingLevels: ['none'] },
            ])
        ).toEqual([
            { value: null, label: 'Terminal default model', labelKey: 'model.terminalDefault' },
            { value: 'openai/gpt-5.4-mini', label: 'openai/gpt-5.4-mini' },
            { value: 'openai/gpt-5.4', label: 'GPT-5.4' },
        ])
    })

    it('keeps composer reasoning options narrow and current-aware', () => {
        expect(getPiComposerReasoningEffortOptions('low', ['none', 'low']).map((option) => option.value)).toEqual([
            null,
            'none',
            'low',
        ])
        expect(getCodexComposerReasoningEffortOptions('minimal').map((option) => option.value)).toContain('minimal')
        expect(getClaudeComposerReasoningEffortOptions('max').map((option) => option.value)).toContain('max')
    })
})
