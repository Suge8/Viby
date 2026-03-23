import { describe, expect, it } from 'vitest'
import {
    getSessionModelLabel,
    getSessionReasoningEffortLabel
} from './sessionModelLabel'

describe('getSessionModelLabel', () => {
    it('prefers the explicit session model', () => {
        expect(getSessionModelLabel({ model: 'gpt-5.4', metadata: { flavor: 'codex' } })).toEqual({
            key: 'session.item.model',
            value: 'GPT-5.4'
        })
    })

    it('renders friendly labels for known Claude aliases', () => {
        expect(getSessionModelLabel({ model: 'opus', metadata: { flavor: 'claude' } })).toEqual({
            key: 'session.item.model',
            value: 'Opus'
        })
    })

    it('returns null when no model is available', () => {
        expect(getSessionModelLabel({})).toBeNull()
    })

    it('returns a display label for reasoning effort when present', () => {
        expect(getSessionReasoningEffortLabel({ modelReasoningEffort: 'xhigh' })).toBe('XHigh')
    })

    it('returns null when reasoning effort is missing', () => {
        expect(getSessionReasoningEffortLabel({})).toBeNull()
    })
})
