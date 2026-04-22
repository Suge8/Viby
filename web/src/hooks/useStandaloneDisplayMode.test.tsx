import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStandaloneDisplayMode } from './useStandaloneDisplayMode'

const foregroundHarness = vi.hoisted(() => ({
    callback: null as null | (() => void),
}))

vi.mock('@/lib/foregroundPulse', () => ({
    subscribeForegroundPulse: (callback: () => void) => {
        foregroundHarness.callback = callback
        return () => {
            if (foregroundHarness.callback === callback) {
                foregroundHarness.callback = null
            }
        }
    },
}))

function createMatchMediaController(initialMatches: boolean) {
    let matches = initialMatches
    const listeners = new Set<() => void>()

    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches: query === '(display-mode: standalone)' ? matches : false,
            media: query,
            onchange: null,
            addEventListener: (_type: string, listener: () => void) => {
                listeners.add(listener)
            },
            removeEventListener: (_type: string, listener: () => void) => {
                listeners.delete(listener)
            },
            addListener: (listener: () => void) => {
                listeners.add(listener)
            },
            removeListener: (listener: () => void) => {
                listeners.delete(listener)
            },
            dispatchEvent: vi.fn(),
        })),
    })

    return {
        setMatches(nextMatches: boolean) {
            matches = nextMatches
            for (const listener of listeners) {
                listener()
            }
        },
    }
}

describe('useStandaloneDisplayMode', () => {
    const originalMatchMedia = window.matchMedia

    beforeEach(() => {
        foregroundHarness.callback = null
        Object.defineProperty(window.navigator, 'standalone', {
            configurable: true,
            value: false,
        })
    })

    afterEach(() => {
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: originalMatchMedia,
        })
    })

    it('tracks display-mode media query changes through the external store owner', () => {
        const controller = createMatchMediaController(false)
        const { result } = renderHook(() => useStandaloneDisplayMode())

        expect(result.current).toBe(false)

        act(() => {
            controller.setMatches(true)
        })

        expect(result.current).toBe(true)
    })

    it('re-reads legacy navigator standalone on foreground pulses', () => {
        createMatchMediaController(false)
        const { result } = renderHook(() => useStandaloneDisplayMode())

        expect(result.current).toBe(false)

        act(() => {
            Object.defineProperty(window.navigator, 'standalone', {
                configurable: true,
                value: true,
            })
            foregroundHarness.callback?.()
        })

        expect(result.current).toBe(true)
    })
})
