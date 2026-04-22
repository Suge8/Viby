import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TRANSIENT_EDITABLE_ATTRIBUTE } from '@/lib/domAttributes'
import { getChatViewportMetrics, getNextChatViewportState, useChatViewportLayout } from './useChatViewportLayout'

type VisualViewportMock = {
    height: number
    offsetTop: number
    addEventListener: (type: string, listener: EventListener) => void
    removeEventListener: (type: string, listener: EventListener) => void
    emit: (type: string) => void
}

function createVisualViewportMock(options: { height: number; offsetTop?: number }): VisualViewportMock {
    const listeners = new Map<string, Set<EventListener>>()

    return {
        height: options.height,
        offsetTop: options.offsetTop ?? 0,
        addEventListener(type: string, listener: EventListener) {
            const typedListeners = listeners.get(type) ?? new Set<EventListener>()
            typedListeners.add(listener)
            listeners.set(type, typedListeners)
        },
        removeEventListener(type: string, listener: EventListener) {
            listeners.get(type)?.delete(listener)
        },
        emit(type: string) {
            const event = new Event(type)
            for (const listener of listeners.get(type) ?? []) {
                listener(event)
            }
        },
    }
}

function installMatchMediaMock(isStandalone: boolean): void {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches: query === '(display-mode: standalone)' ? isStandalone : false,
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    })
}

function setSafeAreaInsetBottom(value: string): void {
    document.documentElement.style.setProperty('--app-safe-area-inset-bottom', value)
}

describe('useChatViewportLayout', () => {
    const originalVisualViewport = window.visualViewport
    const originalInnerHeight = window.innerHeight
    const originalMatchMedia = window.matchMedia

    beforeEach(() => {
        installMatchMediaMock(false)
        setSafeAreaInsetBottom('0px')
        Object.defineProperty(window, 'innerHeight', {
            configurable: true,
            value: 844,
        })
    })

    afterEach(() => {
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: originalMatchMedia,
        })
        Object.defineProperty(window, 'innerHeight', {
            configurable: true,
            value: originalInnerHeight,
        })
        Object.defineProperty(window, 'visualViewport', {
            configurable: true,
            value: originalVisualViewport,
        })
        document.documentElement.style.removeProperty('--app-safe-area-inset-bottom')
    })

    it('derives keyboard inset from the visible viewport bottom after subtracting safe area compensation', () => {
        expect(
            getChatViewportMetrics(
                844,
                {
                    height: 524,
                    offsetTop: 0,
                },
                34
            )
        ).toEqual({
            isKeyboardOpen: true,
            bottomInsetPx: 286,
        })
    })

    it('keeps small browser chrome insets instead of subtracting them away', () => {
        expect(
            getChatViewportMetrics(
                844,
                {
                    height: 820,
                    offsetTop: 0,
                },
                34
            )
        ).toEqual({
            isKeyboardOpen: true,
            bottomInsetPx: 24,
        })
    })

    it('promotes the stable viewport baseline to the largest layout height seen in the current orientation', () => {
        const firstFocusState = getNextChatViewportState({
            layoutViewportHeight: 664,
            visualViewport: { height: 385, offsetTop: 0 },
            safeAreaInsetBottomPx: 34,
            editableFocusActive: true,
            isStandalone: true,
            previousState: null,
            orientationKey: 'portrait',
        })

        expect(firstFocusState).toMatchObject({
            isStandalone: true,
            isKeyboardOpen: true,
            bottomInsetPx: 245,
            floatingControlBottomInsetPx: 245,
            visibleViewportBottomPx: 385,
            stableViewportHeightPx: 664,
        })

        const blurState = getNextChatViewportState({
            layoutViewportHeight: 724,
            visualViewport: { height: 724, offsetTop: 0 },
            safeAreaInsetBottomPx: 34,
            editableFocusActive: false,
            isStandalone: true,
            previousState: firstFocusState,
            orientationKey: 'portrait',
        })

        expect(blurState).toMatchObject({
            isStandalone: true,
            isKeyboardOpen: false,
            bottomInsetPx: 0,
            floatingControlBottomInsetPx: 0,
            visibleViewportBottomPx: 724,
            stableViewportHeightPx: 724,
        })

        const secondFocusState = getNextChatViewportState({
            layoutViewportHeight: 724,
            visualViewport: { height: 385, offsetTop: 0 },
            safeAreaInsetBottomPx: 34,
            editableFocusActive: true,
            isStandalone: true,
            previousState: blurState,
            orientationKey: 'portrait',
        })

        expect(secondFocusState).toMatchObject({
            isStandalone: true,
            isKeyboardOpen: true,
            bottomInsetPx: 305,
            floatingControlBottomInsetPx: 305,
            visibleViewportBottomPx: 385,
            stableViewportHeightPx: 724,
        })
    })

    it('keeps keyboard detection working when interactive-widget shrinks the layout viewport itself', () => {
        const previousIdleState = getNextChatViewportState({
            layoutViewportHeight: 844,
            visualViewport: { height: 844, offsetTop: 0 },
            safeAreaInsetBottomPx: 34,
            editableFocusActive: false,
            isStandalone: true,
            previousState: null,
            orientationKey: 'portrait',
        })

        const focusedState = getNextChatViewportState({
            layoutViewportHeight: 544,
            visualViewport: { height: 544, offsetTop: 0 },
            safeAreaInsetBottomPx: 34,
            editableFocusActive: true,
            isStandalone: true,
            previousState: previousIdleState,
            orientationKey: 'portrait',
        })

        expect(focusedState).toMatchObject({
            isKeyboardOpen: true,
            bottomInsetPx: 266,
            floatingControlBottomInsetPx: 266,
            visibleViewportBottomPx: 544,
            stableViewportHeightPx: 844,
        })
    })

    it('keeps the floating control inset stable while the keyboard viewport jitters during the same focus cycle', () => {
        const firstFocusState = getNextChatViewportState({
            layoutViewportHeight: 844,
            visualViewport: { height: 544, offsetTop: 0 },
            safeAreaInsetBottomPx: 34,
            editableFocusActive: true,
            isStandalone: true,
            previousState: null,
            orientationKey: 'portrait',
        })

        const jitteredFocusState = getNextChatViewportState({
            layoutViewportHeight: 844,
            visualViewport: { height: 592, offsetTop: 0 },
            safeAreaInsetBottomPx: 34,
            editableFocusActive: true,
            isStandalone: true,
            previousState: firstFocusState,
            orientationKey: 'portrait',
        })

        expect(firstFocusState).toMatchObject({
            bottomInsetPx: 266,
            floatingControlBottomInsetPx: 266,
        })
        expect(jitteredFocusState).toMatchObject({
            bottomInsetPx: 218,
            floatingControlBottomInsetPx: 266,
        })
    })

    it('tracks visual viewport resize events only while an editable field is focused', () => {
        installMatchMediaMock(true)
        setSafeAreaInsetBottom('34px')

        const input = document.createElement('textarea')
        document.body.appendChild(input)

        const visualViewport = createVisualViewportMock({ height: 844 })
        Object.defineProperty(window, 'visualViewport', {
            configurable: true,
            value: visualViewport,
        })

        const { result } = renderHook(() => useChatViewportLayout())

        expect(result.current).toEqual({
            isStandalone: true,
            isKeyboardOpen: false,
            bottomInsetPx: 0,
            floatingControlBottomInsetPx: 0,
            visibleViewportBottomPx: 844,
        })

        act(() => {
            input.focus()
            visualViewport.height = 544
            visualViewport.emit('resize')
        })

        expect(result.current).toEqual({
            isStandalone: true,
            isKeyboardOpen: true,
            bottomInsetPx: 266,
            floatingControlBottomInsetPx: 266,
            visibleViewportBottomPx: 544,
        })

        act(() => {
            input.blur()
            visualViewport.height = 844
            visualViewport.emit('resize')
        })

        expect(result.current).toEqual({
            isStandalone: true,
            isKeyboardOpen: false,
            bottomInsetPx: 0,
            floatingControlBottomInsetPx: 0,
            visibleViewportBottomPx: 844,
        })

        input.remove()
    })

    it('ignores non-editable focus transitions so floating controls do not perturb chat layout', () => {
        installMatchMediaMock(true)
        setSafeAreaInsetBottom('34px')

        const button = document.createElement('button')
        document.body.appendChild(button)

        const { result } = renderHook(() => useChatViewportLayout())
        const initialLayout = result.current

        act(() => {
            button.focus()
            button.blur()
        })

        expect(result.current).toEqual(initialLayout)
        button.remove()
    })

    it('returns the current idle layout without consulting global navigation state', () => {
        const previousState = getNextChatViewportState({
            layoutViewportHeight: 844,
            visualViewport: { height: 844, offsetTop: 0 },
            safeAreaInsetBottomPx: 34,
            editableFocusActive: false,
            isStandalone: true,
            previousState: null,
            orientationKey: 'portrait',
        })

        const nextState = getNextChatViewportState({
            layoutViewportHeight: 796,
            visualViewport: { height: 796, offsetTop: 0 },
            safeAreaInsetBottomPx: 34,
            editableFocusActive: false,
            isStandalone: true,
            previousState,
            orientationKey: 'portrait',
        })

        expect(nextState).toMatchObject({
            isStandalone: true,
            isKeyboardOpen: false,
            bottomInsetPx: 0,
            floatingControlBottomInsetPx: 0,
            visibleViewportBottomPx: 844,
            stableViewportHeightPx: 844,
        })
    })

    it('ignores transient clipboard editables when tracking keyboard layout', () => {
        installMatchMediaMock(true)
        setSafeAreaInsetBottom('34px')

        const clipboardBuffer = document.createElement('textarea')
        clipboardBuffer.setAttribute(TRANSIENT_EDITABLE_ATTRIBUTE, 'true')
        document.body.appendChild(clipboardBuffer)

        const visualViewport = createVisualViewportMock({ height: 844 })
        Object.defineProperty(window, 'visualViewport', {
            configurable: true,
            value: visualViewport,
        })

        const { result } = renderHook(() => useChatViewportLayout())

        act(() => {
            clipboardBuffer.focus()
            visualViewport.height = 544
            visualViewport.emit('resize')
        })

        expect(result.current).toEqual({
            isStandalone: true,
            isKeyboardOpen: false,
            bottomInsetPx: 0,
            floatingControlBottomInsetPx: 0,
            visibleViewportBottomPx: 844,
        })

        clipboardBuffer.remove()
    })
})
