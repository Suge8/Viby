import { describe, expect, it } from 'vitest'
import { isComposerCompositionActive, shouldComposerSendFromKeyboard } from './composerKeyboard'

describe('composerKeyboard', () => {
    it('treats desktop Enter as send but keeps touch and Shift+Enter on the newline path', () => {
        expect(
            shouldComposerSendFromKeyboard({
                key: 'Enter',
                enterBehavior: 'enter-to-send',
                shiftKey: false,
                altKey: false,
                ctrlKey: false,
                metaKey: false,
                isTouch: false,
            })
        ).toBe(true)

        expect(
            shouldComposerSendFromKeyboard({
                key: 'Enter',
                enterBehavior: 'enter-to-send',
                shiftKey: true,
                altKey: false,
                ctrlKey: false,
                metaKey: false,
                isTouch: false,
            })
        ).toBe(false)

        expect(
            shouldComposerSendFromKeyboard({
                key: 'Enter',
                enterBehavior: 'enter-to-send',
                shiftKey: false,
                altKey: false,
                ctrlKey: false,
                metaKey: false,
                isTouch: true,
            })
        ).toBe(false)

        expect(
            shouldComposerSendFromKeyboard({
                key: 'Enter',
                enterBehavior: 'enter-to-send',
                shiftKey: false,
                altKey: true,
                ctrlKey: false,
                metaKey: false,
                isTouch: false,
            })
        ).toBe(false)

        expect(
            shouldComposerSendFromKeyboard({
                key: 'Enter',
                enterBehavior: 'enter-to-send',
                shiftKey: false,
                altKey: false,
                ctrlKey: true,
                metaKey: false,
                isTouch: false,
            })
        ).toBe(false)

        expect(
            shouldComposerSendFromKeyboard({
                key: 'Enter',
                enterBehavior: 'enter-to-send',
                shiftKey: false,
                altKey: false,
                ctrlKey: false,
                metaKey: true,
                isTouch: false,
            })
        ).toBe(false)
    })

    it('ignores non-Enter keys so textarea editing shortcuts stay native', () => {
        expect(
            shouldComposerSendFromKeyboard({
                key: 'Tab',
                enterBehavior: 'enter-to-send',
                shiftKey: false,
                altKey: false,
                ctrlKey: false,
                metaKey: false,
                isTouch: false,
            })
        ).toBe(false)
    })

    it('supports Enter newline mode with Ctrl or Meta Enter as the send shortcut', () => {
        expect(
            shouldComposerSendFromKeyboard({
                key: 'Enter',
                enterBehavior: 'modifier-enter-to-send',
                shiftKey: false,
                altKey: false,
                ctrlKey: false,
                metaKey: false,
                isTouch: false,
            })
        ).toBe(false)

        expect(
            shouldComposerSendFromKeyboard({
                key: 'Enter',
                enterBehavior: 'modifier-enter-to-send',
                shiftKey: false,
                altKey: false,
                ctrlKey: true,
                metaKey: false,
                isTouch: false,
            })
        ).toBe(true)

        expect(
            shouldComposerSendFromKeyboard({
                key: 'Enter',
                enterBehavior: 'modifier-enter-to-send',
                shiftKey: false,
                altKey: false,
                ctrlKey: false,
                metaKey: true,
                isTouch: false,
            })
        ).toBe(true)
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
