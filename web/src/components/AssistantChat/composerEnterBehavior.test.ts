import { beforeEach, describe, expect, it } from 'vitest'
import {
    normalizeComposerEnterBehavior,
    readComposerEnterBehavior,
    writeComposerEnterBehavior,
} from './composerEnterBehavior'

describe('composerEnterBehavior', () => {
    beforeEach(() => {
        window.localStorage.clear()
    })

    it('defaults malformed values to Enter-to-send', () => {
        expect(normalizeComposerEnterBehavior(null)).toBe('enter-to-send')
        expect(normalizeComposerEnterBehavior('legacy')).toBe('enter-to-send')
    })

    it('persists the modifier-send preference', () => {
        writeComposerEnterBehavior('modifier-enter-to-send')

        expect(readComposerEnterBehavior()).toBe('modifier-enter-to-send')
    })
})
