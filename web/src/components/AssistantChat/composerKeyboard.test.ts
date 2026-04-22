import { describe, expect, it } from 'vitest'
import { isComposerCompositionActive, shouldComposerSendFromKeyboard } from './composerKeyboard'

describe('composerKeyboard', () => {
    it('treats desktop Enter as send but keeps touch and Shift+Enter on the newline path', () => {
        expect(
            shouldComposerSendFromKeyboard({
                key: 'Enter',
                shiftKey: false,
                altKey: false,
                isTouch: false,
            })
        ).toBe(true)

        expect(
            shouldComposerSendFromKeyboard({
                key: 'Enter',
                shiftKey: true,
                altKey: false,
                isTouch: false,
            })
        ).toBe(false)

        expect(
            shouldComposerSendFromKeyboard({
                key: 'Enter',
                shiftKey: false,
                altKey: false,
                isTouch: true,
            })
        ).toBe(false)

        expect(
            shouldComposerSendFromKeyboard({
                key: 'Enter',
                shiftKey: false,
                altKey: true,
                isTouch: false,
            })
        ).toBe(false)
    })

    it('ignores non-Enter keys so textarea editing shortcuts stay native', () => {
        expect(
            shouldComposerSendFromKeyboard({
                key: 'Tab',
                shiftKey: false,
                altKey: false,
                isTouch: false,
            })
        ).toBe(false)
    })

    it('treats explicit composition state as authoritative for IME safety', () => {
        expect(
            isComposerCompositionActive({
                isComposing: true,
                nativeEvent: { isComposing: false },
            })
        ).toBe(true)

        expect(
            isComposerCompositionActive({
                isComposing: false,
                nativeEvent: { isComposing: true },
            })
        ).toBe(true)

        expect(
            isComposerCompositionActive({
                isComposing: false,
                nativeEvent: { ['key' + 'Code']: 229 },
            })
        ).toBe(true)

        expect(
            isComposerCompositionActive({
                isComposing: false,
                nativeEvent: { isComposing: false },
            })
        ).toBe(false)
    })
})
