import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStickyTrue } from './useStickyTrue'

describe('useStickyTrue', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('mirrors the input value when it transitions to true', () => {
        const { result, rerender } = renderHook((value: boolean) => useStickyTrue(value, 500), {
            initialProps: false,
        })

        expect(result.current).toBe(false)

        rerender(true)
        expect(result.current).toBe(true)
    })

    it('keeps the value true for the minimum duration after the source flips to false', () => {
        const { result, rerender } = renderHook((value: boolean) => useStickyTrue(value, 500), {
            initialProps: true,
        })

        expect(result.current).toBe(true)

        rerender(false)
        expect(result.current).toBe(true)

        act(() => {
            vi.advanceTimersByTime(499)
        })
        expect(result.current).toBe(true)

        act(() => {
            vi.advanceTimersByTime(1)
        })
        expect(result.current).toBe(false)
    })

    it('cancels the pending hide when the source flips back to true before the minimum elapses', () => {
        const { result, rerender } = renderHook((value: boolean) => useStickyTrue(value, 500), {
            initialProps: true,
        })

        rerender(false)
        act(() => {
            vi.advanceTimersByTime(200)
        })
        rerender(true)
        act(() => {
            vi.advanceTimersByTime(1000)
        })

        expect(result.current).toBe(true)
    })
})
