import { describe, expect, it } from 'vitest'
import {
    CLAUDE_REASONING_EFFORT_OPTIONS,
    CODEX_REASONING_EFFORT_OPTIONS,
    MODEL_OPTIONS,
    getClaudeComposerModelOptions,
    getClaudeComposerReasoningEffortOptions,
    getCodexComposerModelOptions,
    getCodexComposerReasoningEffortOptions,
    getNextClaudeComposerModel
} from './sessionConfigOptions'

describe('sessionConfigOptions', () => {
    it('keeps new-session Claude options narrowed to terminal default plus 1m presets', () => {
        expect(MODEL_OPTIONS.claude).toEqual([
            { value: 'auto', label: 'Terminal default model', labelKey: 'model.terminalDefault' },
            { value: 'sonnet[1m]', label: 'Sonnet' },
            { value: 'opus[1m]', label: 'Opus' },
        ])
    })

    it('keeps new-session Codex options aligned with the curated model list', () => {
        expect(MODEL_OPTIONS.codex).toEqual([
            { value: 'auto', label: 'Terminal default model', labelKey: 'model.terminalDefault' },
            { value: 'gpt-5.4', label: 'GPT-5.4' },
            { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
            { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
            { value: 'gpt-5.2', label: 'GPT-5.2' },
        ])
    })

    it('keeps new-session Codex reasoning effort options aligned with the curated list', () => {
        expect(CODEX_REASONING_EFFORT_OPTIONS).toEqual([
            { value: 'default', label: 'Terminal default reasoning effort', labelKey: 'reasoningEffort.terminalDefault' },
            { value: 'low', label: 'Low', labelKey: 'reasoningEffort.low' },
            { value: 'medium', label: 'Medium', labelKey: 'reasoningEffort.medium' },
            { value: 'high', label: 'High', labelKey: 'reasoningEffort.high' },
            { value: 'xhigh', label: 'XHigh', labelKey: 'reasoningEffort.xhigh' },
        ])
    })

    it('keeps new-session Claude reasoning effort options aligned with the supported list', () => {
        expect(CLAUDE_REASONING_EFFORT_OPTIONS).toEqual([
            { value: 'default', label: 'Terminal default reasoning effort', labelKey: 'reasoningEffort.terminalDefault' },
            { value: 'low', label: 'Low', labelKey: 'reasoningEffort.low' },
            { value: 'medium', label: 'Medium', labelKey: 'reasoningEffort.medium' },
            { value: 'high', label: 'High', labelKey: 'reasoningEffort.high' },
            { value: 'max', label: 'Max', labelKey: 'reasoningEffort.max' },
        ])
    })

    it('includes the active non-preset Claude model in composer options', () => {
        expect(getClaudeComposerModelOptions('claude-opus-4-1-20250805')).toEqual([
            { value: null, label: 'Terminal default model', labelKey: 'model.terminalDefault' },
            { value: 'claude-opus-4-1-20250805', label: 'claude-opus-4-1-20250805' },
            { value: 'sonnet[1m]', label: 'Sonnet' },
            { value: 'opus[1m]', label: 'Opus' },
        ])
    })

    it('includes the active non-curated Codex model in composer options', () => {
        expect(getCodexComposerModelOptions('gpt-5.5-preview')).toEqual([
            { value: null, label: 'Terminal default model', labelKey: 'model.terminalDefault' },
            { value: 'gpt-5.5-preview', label: 'gpt-5.5-preview' },
            { value: 'gpt-5.4', label: 'GPT-5.4' },
            { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
            { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
            { value: 'gpt-5.2', label: 'GPT-5.2' },
        ])
    })

    it('includes the active non-curated Codex reasoning effort in composer options', () => {
        expect(getCodexComposerReasoningEffortOptions('minimal')).toEqual([
            { value: null, label: 'Terminal default reasoning effort', labelKey: 'reasoningEffort.terminalDefault' },
            { value: 'minimal', label: 'Minimal', labelKey: 'reasoningEffort.minimal' },
            { value: 'low', label: 'Low', labelKey: 'reasoningEffort.low' },
            { value: 'medium', label: 'Medium', labelKey: 'reasoningEffort.medium' },
            { value: 'high', label: 'High', labelKey: 'reasoningEffort.high' },
            { value: 'xhigh', label: 'XHigh', labelKey: 'reasoningEffort.xhigh' },
        ])
    })

    it('includes the active Claude reasoning effort in composer options', () => {
        expect(getClaudeComposerReasoningEffortOptions('max')).toEqual([
            { value: null, label: 'Terminal default reasoning effort', labelKey: 'reasoningEffort.terminalDefault' },
            { value: 'low', label: 'Low', labelKey: 'reasoningEffort.low' },
            { value: 'medium', label: 'Medium', labelKey: 'reasoningEffort.medium' },
            { value: 'high', label: 'High', labelKey: 'reasoningEffort.high' },
            { value: 'max', label: 'Max', labelKey: 'reasoningEffort.max' },
        ])
    })

    it('cycles from a non-preset Claude model to the next selectable model instead of auto', () => {
        expect(getNextClaudeComposerModel('claude-opus-4-1-20250805')).toBe('sonnet[1m]')
    })
})
