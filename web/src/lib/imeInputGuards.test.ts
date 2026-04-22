import { describe, expect, it } from 'vitest'
import { hasImeInProgressFallbackCode, isImeKeyboardCompositionActive } from '@/lib/imeInputGuards'

describe('imeInputGuards', () => {
    it('treats the IME 229 fallback code as an active composition signal', () => {
        expect(hasImeInProgressFallbackCode(229)).toBe(true)
        expect(hasImeInProgressFallbackCode(13)).toBe(false)
    })

    it('treats any active composition signal as authoritative', () => {
        expect(
            isImeKeyboardCompositionActive({
                isComposing: true,
                nativeEvent: { isComposing: false },
            })
        ).toBe(true)

        expect(
            isImeKeyboardCompositionActive({
                isComposing: false,
                nativeEvent: { isComposing: true },
            })
        ).toBe(true)

        expect(
            isImeKeyboardCompositionActive({
                isComposing: false,
                nativeEvent: { ['key' + 'Code']: 229 },
            })
        ).toBe(true)
    })
})
