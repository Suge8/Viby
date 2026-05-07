import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_FONT_SCALE, initializeFontScale, useFontScale } from './useFontScale'

const FONT_SCALE_KEY = 'viby-font-scale'

beforeEach(() => {
    document.documentElement.style.removeProperty('--app-font-scale')
})

describe('font scale preference', () => {
    it('defaults first-run users to 90%', () => {
        initializeFontScale()

        expect(document.documentElement.style.getPropertyValue('--app-font-scale')).toBe(String(DEFAULT_FONT_SCALE))
    })

    it('keeps 100% as an explicit non-default preference', () => {
        const { result } = renderHook(() => useFontScale())

        act(() => result.current.setFontScale(1))

        expect(window.localStorage.getItem(FONT_SCALE_KEY)).toBe('1')
        expect(result.current.fontScale).toBe(1)
    })

    it('removes stored preference when returning to the 90% default', () => {
        window.localStorage.setItem(FONT_SCALE_KEY, '1')
        const { result } = renderHook(() => useFontScale())

        act(() => result.current.setFontScale(DEFAULT_FONT_SCALE))

        expect(window.localStorage.getItem(FONT_SCALE_KEY)).toBeNull()
        expect(result.current.fontScale).toBe(DEFAULT_FONT_SCALE)
    })
})
