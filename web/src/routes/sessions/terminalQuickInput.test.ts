import { describe, expect, it } from 'vitest'
import { applyModifierState, shouldResetModifiers } from '@/routes/sessions/terminalQuickInput'

describe('terminalQuickInput', () => {
    it('applies alt modifier by prefixing escape', () => {
        expect(applyModifierState('a', { ctrl: false, alt: true })).toBe('\u001ba')
    })

    it('applies ctrl modifier to single characters', () => {
        expect(applyModifierState('c', { ctrl: true, alt: false })).toBe('\u0003')
        expect(applyModifierState('\u001b[A', { ctrl: true, alt: false })).toBe('\u001b[A')
    })

    it('resets modifiers only for non-empty sequences', () => {
        expect(shouldResetModifiers('', { ctrl: true, alt: true })).toBe(false)
        expect(shouldResetModifiers('a', { ctrl: true, alt: false })).toBe(true)
    })
})
