import { CLAUDE_SELECTABLE_MODEL_PRESETS, CLAUDE_MODEL_PRESETS, getClaudeModelLabel } from '@viby/protocol'
import { describe, expect, it } from 'vitest'
import { CLAUDE_REASONING_EFFORT_OPTIONS, MODEL_OPTIONS } from '@/lib/sessionConfigOptions'

describe('Claude model options', () => {
    it('only exposes terminal default plus the sonnet and opus aliases in the expected order', () => {
        expect(MODEL_OPTIONS.claude).toEqual([
            { value: 'auto', label: 'Terminal default model', labelKey: 'model.terminalDefault' },
            { value: 'sonnet', label: 'Sonnet' },
            { value: 'opus', label: 'Opus' },
        ])
    })

    it('keeps the selectable Claude presets narrowed to sonnet and opus aliases', () => {
        expect(CLAUDE_SELECTABLE_MODEL_PRESETS).toEqual(['sonnet', 'opus'])
    })

    it('exposes friendly labels for Claude model presets, including legacy values', () => {
        expect(CLAUDE_MODEL_PRESETS).toEqual(['sonnet', 'sonnet[1m]', 'opus', 'opus[1m]'])
        expect(getClaudeModelLabel('sonnet')).toBe('Sonnet')
        expect(getClaudeModelLabel('sonnet[1m]')).toBe('Sonnet')
        expect(getClaudeModelLabel('opus')).toBe('Opus')
        expect(getClaudeModelLabel('opus[1m]')).toBe('Opus')
    })

    it('exposes the supported Claude reasoning effort options in the expected order', () => {
        expect(CLAUDE_REASONING_EFFORT_OPTIONS).toEqual([
            { value: 'default', label: 'Terminal default reasoning effort', labelKey: 'reasoningEffort.terminalDefault' },
            { value: 'low', label: 'Low', labelKey: 'reasoningEffort.low' },
            { value: 'medium', label: 'Medium', labelKey: 'reasoningEffort.medium' },
            { value: 'high', label: 'High', labelKey: 'reasoningEffort.high' },
            { value: 'max', label: 'Max', labelKey: 'reasoningEffort.max' },
        ])
    })
})

describe('Codex model options', () => {
    it('uses the requested terminal-default plus curated explicit models', () => {
        expect(MODEL_OPTIONS.codex).toEqual([
            { value: 'auto', label: 'Terminal default model', labelKey: 'model.terminalDefault' },
            { value: 'gpt-5.4', label: 'GPT-5.4' },
            { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
            { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
            { value: 'gpt-5.2', label: 'GPT-5.2' },
        ])
    })
})
