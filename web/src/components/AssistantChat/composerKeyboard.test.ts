import { describe, expect, it } from 'vitest'
import { isComposerCompositionActive, isComposerSendShortcut } from './composerKeyboard'

describe('composerKeyboard', () => {
    it('only treats Cmd/Ctrl+Enter as the send shortcut', () => {
        expect(isComposerSendShortcut({
            key: 'Enter',
            ctrlKey: true,
            metaKey: false,
            altKey: false
        })).toBe(true)

        expect(isComposerSendShortcut({
            key: 'Enter',
            ctrlKey: false,
            metaKey: true,
            altKey: false
        })).toBe(true)

        expect(isComposerSendShortcut({
            key: 'Enter',
            ctrlKey: false,
            metaKey: false,
            altKey: false
        })).toBe(false)

        expect(isComposerSendShortcut({
            key: 'Enter',
            ctrlKey: true,
            metaKey: false,
            altKey: true
        })).toBe(false)
    })

    it('treats explicit composition state as authoritative for IME safety', () => {
        expect(isComposerCompositionActive({
            isComposing: true,
            nativeIsComposing: false
        })).toBe(true)

        expect(isComposerCompositionActive({
            isComposing: false,
            nativeIsComposing: true
        })).toBe(true)

        expect(isComposerCompositionActive({
            isComposing: false,
            nativeIsComposing: false
        })).toBe(false)
    })
})
