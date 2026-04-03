import { describe, expect, it } from 'vitest'
import {
    getSessionModelLabel,
    getSessionReasoningEffortLabel
} from './sessionModelLabel'

describe('getSessionModelLabel', () => {
    it('uses the authoritative driver to label the current model', () => {
        expect(getSessionModelLabel({ model: 'gpt-5.4', metadata: { driver: 'codex' } })).toEqual({
            key: 'session.item.model',
            value: 'GPT-5.4'
        })
    })

    it('uses the explicit Claude driver to label Claude presets', () => {
        expect(getSessionModelLabel({ model: 'opus', metadata: { driver: 'claude' } })).toEqual({
            key: 'session.item.model',
            value: 'Opus'
        })
    })

    it('falls back to generic labeling when the driver is malformed', () => {
        expect(getSessionModelLabel({ model: 'opus', metadata: { driver: 'unknown' as never } })).toEqual({
            key: 'session.item.model',
            value: 'Opus'
        })
    })

    it('returns null when no model is available', () => {
        expect(getSessionModelLabel({})).toBeNull()
    })

    it('uses authoritative Pi capability labels when present', () => {
        expect(getSessionModelLabel({
            model: 'openai/gpt-5.4-mini',
            metadata: {
                driver: 'pi',
                piModelScope: {
                    models: [
                        {
                            id: 'openai/gpt-5.4-mini',
                            label: 'GPT-5.4 Mini',
                            supportedThinkingLevels: ['none', 'low']
                        }
                    ]
                }
            }
        })).toEqual({
            key: 'session.item.model',
            value: 'GPT-5.4 Mini'
        })
    })

    it('returns a display label for reasoning effort when present', () => {
        expect(getSessionReasoningEffortLabel({ modelReasoningEffort: 'xhigh' })).toBe('XHigh')
    })

    it('returns null when reasoning effort is missing', () => {
        expect(getSessionReasoningEffortLabel({})).toBeNull()
    })
})
