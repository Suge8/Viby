import { act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createMouseEvent, createPointerEvent, setupLongPressHarness } from './useLongPress.test-support'

describe('useLongPress', () => {
    it('fires the short-click path exactly once for a primary pointer tap', () => {
        vi.useFakeTimers()
        const onClick = vi.fn()
        const onLongPress = vi.fn()
        const handlers = setupLongPressHarness({ onClick, onLongPress })

        act(() => {
            handlers.onPointerDown(
                createPointerEvent({
                    clientX: 16,
                    clientY: 20,
                    pointerId: 1,
                })
            )
            vi.advanceTimersByTime(200)
            handlers.onPointerUp(createPointerEvent({ pointerId: 1 }))
        })

        const clickEvent = createMouseEvent()
        handlers.onClick(clickEvent)

        expect(onClick).toHaveBeenCalledTimes(1)
        expect(onLongPress).not.toHaveBeenCalled()
        expect(clickEvent.preventDefault).toHaveBeenCalledTimes(1)
        expect(clickEvent.stopPropagation).toHaveBeenCalledTimes(1)
    })

    it('fires long press once and suppresses the follow-up click', () => {
        vi.useFakeTimers()
        const onClick = vi.fn()
        const onLongPress = vi.fn()
        const handlers = setupLongPressHarness({ onClick, onLongPress })

        act(() => {
            handlers.onPointerDown(
                createPointerEvent({
                    clientX: 24,
                    clientY: 32,
                    pointerId: 2,
                })
            )
            vi.advanceTimersByTime(600)
            handlers.onPointerUp(createPointerEvent({ pointerId: 2 }))
        })

        const clickEvent = createMouseEvent()
        handlers.onClick(clickEvent)

        expect(onLongPress).toHaveBeenCalledWith({ x: 24, y: 32 })
        expect(onLongPress).toHaveBeenCalledTimes(1)
        expect(onClick).not.toHaveBeenCalled()
        expect(clickEvent.preventDefault).toHaveBeenCalledTimes(1)
        expect(clickEvent.stopPropagation).toHaveBeenCalledTimes(1)
    })

    it('does not arm the long-press timer for a primary mouse click', () => {
        vi.useFakeTimers()
        const onClick = vi.fn()
        const onLongPress = vi.fn()
        const handlers = setupLongPressHarness({ onClick, onLongPress })

        act(() => {
            handlers.onPointerDown(
                createPointerEvent({
                    clientX: 24,
                    clientY: 32,
                    pointerId: 5,
                    pointerType: 'mouse',
                })
            )
            vi.advanceTimersByTime(600)
            handlers.onPointerUp(
                createPointerEvent({
                    pointerId: 5,
                    pointerType: 'mouse',
                })
            )
        })

        const clickEvent = createMouseEvent()
        handlers.onClick(clickEvent)

        expect(onLongPress).not.toHaveBeenCalled()
        expect(onClick).toHaveBeenCalledTimes(1)
        expect(clickEvent.preventDefault).not.toHaveBeenCalled()
        expect(clickEvent.stopPropagation).not.toHaveBeenCalled()
    })

    it('suppresses the follow-up click when the pointer moves beyond tolerance', () => {
        vi.useFakeTimers()
        const onClick = vi.fn()
        const onLongPress = vi.fn()
        const handlers = setupLongPressHarness({ onClick, onLongPress })

        act(() => {
            handlers.onPointerDown(
                createPointerEvent({
                    clientX: 10,
                    clientY: 10,
                    pointerId: 3,
                })
            )
            handlers.onPointerMove(
                createPointerEvent({
                    clientX: 30,
                    clientY: 10,
                    pointerId: 3,
                })
            )
            vi.advanceTimersByTime(600)
            handlers.onPointerUp(createPointerEvent({ pointerId: 3 }))
        })

        const clickEvent = createMouseEvent()
        handlers.onClick(clickEvent)

        expect(onLongPress).not.toHaveBeenCalled()
        expect(onClick).not.toHaveBeenCalled()
        expect(clickEvent.preventDefault).toHaveBeenCalledTimes(1)
        expect(clickEvent.stopPropagation).toHaveBeenCalledTimes(1)
    })

    it('cancels the pending long-press timer when click arrives before pointer-up', () => {
        vi.useFakeTimers()
        const onClick = vi.fn()
        const onLongPress = vi.fn()
        const handlers = setupLongPressHarness({ onClick, onLongPress })

        act(() => {
            handlers.onPointerDown(
                createPointerEvent({
                    clientX: 18,
                    clientY: 24,
                    pointerId: 4,
                })
            )
            vi.advanceTimersByTime(120)
        })

        const clickEvent = createMouseEvent()
        handlers.onClick(clickEvent)

        act(() => {
            vi.advanceTimersByTime(600)
        })

        expect(onClick).toHaveBeenCalledTimes(1)
        expect(onLongPress).not.toHaveBeenCalled()
        expect(clickEvent.preventDefault).not.toHaveBeenCalled()
        expect(clickEvent.stopPropagation).not.toHaveBeenCalled()
    })
})
