import { act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createMouseEvent, createPointerEvent, setupLongPressHarness } from './useLongPress.test-support'

describe('useLongPress contextmenu routing', () => {
    it('ignores contextmenu unless explicitly enabled', () => {
        const onLongPress = vi.fn()
        const handlers = setupLongPressHarness({ onLongPress })
        const contextMenuEvent = createMouseEvent()

        contextMenuEvent.clientX = 40
        contextMenuEvent.clientY = 56
        handlers.onContextMenu(contextMenuEvent)

        expect(onLongPress).not.toHaveBeenCalled()
        expect(contextMenuEvent.preventDefault).not.toHaveBeenCalled()
        expect(contextMenuEvent.stopPropagation).not.toHaveBeenCalled()
    })

    it('routes desktop secondary action through contextmenu when enabled', () => {
        const onLongPress = vi.fn()
        const handlers = setupLongPressHarness({
            enableContextMenu: true,
            onLongPress,
        })
        const contextMenuEvent = createMouseEvent()

        contextMenuEvent.clientX = 48
        contextMenuEvent.clientY = 72
        handlers.onContextMenu(contextMenuEvent)

        expect(onLongPress).toHaveBeenCalledTimes(1)
        expect(onLongPress).toHaveBeenCalledWith({ x: 48, y: 72 })
        expect(contextMenuEvent.preventDefault).toHaveBeenCalledTimes(1)
    })

    it('suppresses the duplicate native contextmenu after a touch long press', () => {
        vi.useFakeTimers()
        const onLongPress = vi.fn()
        const handlers = setupLongPressHarness({
            enableContextMenu: true,
            onLongPress,
        })

        act(() => {
            handlers.onPointerDown(
                createPointerEvent({
                    clientX: 20,
                    clientY: 28,
                    pointerId: 6,
                })
            )
            vi.advanceTimersByTime(600)
        })

        const contextMenuEvent = createMouseEvent()
        contextMenuEvent.clientX = 20
        contextMenuEvent.clientY = 28
        handlers.onContextMenu(contextMenuEvent)

        expect(onLongPress).toHaveBeenCalledTimes(1)
        expect(onLongPress).toHaveBeenCalledWith({ x: 20, y: 28 })
        expect(contextMenuEvent.preventDefault).toHaveBeenCalledTimes(1)
    })
})
