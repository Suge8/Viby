import type React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { useLongPress } from './useLongPress'

type LongPressHandlers = ReturnType<typeof useLongPress>

function LongPressHarness(props: {
    disabled?: boolean
    onClick?: () => void
    onLongPress?: (point: { x: number; y: number }) => void
    onReady: (handlers: LongPressHandlers) => void
}): null {
    const handlers = useLongPress({
        disabled: props.disabled,
        onClick: props.onClick,
        onLongPress: props.onLongPress ?? (() => {})
    })

    useEffect(() => {
        props.onReady(handlers)
    }, [handlers, props])

    return null
}

function createPointerEvent(overrides: Partial<{
    button: number
    clientX: number
    clientY: number
    isPrimary: boolean
    pointerId: number
    pointerType: string
}> = {}): React.PointerEvent<Element> {
    return {
        button: overrides.button ?? 0,
        clientX: overrides.clientX ?? 0,
        clientY: overrides.clientY ?? 0,
        isPrimary: overrides.isPrimary ?? true,
        pointerId: overrides.pointerId ?? 1,
        pointerType: overrides.pointerType ?? 'touch',
    } as React.PointerEvent<Element>
}

function createMouseEvent(): React.MouseEvent<Element> & {
    preventDefault: ReturnType<typeof vi.fn>
    stopPropagation: ReturnType<typeof vi.fn>
} {
    const preventDefault = vi.fn()
    const stopPropagation = vi.fn()

    return {
        preventDefault,
        stopPropagation
    } as React.MouseEvent<Element> & {
        preventDefault: ReturnType<typeof vi.fn>
        stopPropagation: ReturnType<typeof vi.fn>
    }
}

describe('useLongPress', () => {
    afterEach(() => {
        cleanup()
        vi.useRealTimers()
    })

    it('fires the short-click path exactly once for a primary pointer tap', () => {
        vi.useFakeTimers()
        const onClick = vi.fn()
        const onLongPress = vi.fn()
        let handlers: LongPressHandlers | null = null

        render(
            <LongPressHarness
                onClick={onClick}
                onLongPress={onLongPress}
                onReady={(nextHandlers) => {
                    handlers = nextHandlers
                }}
            />
        )

        expect(handlers).not.toBeNull()

        act(() => {
            handlers!.onPointerDown(createPointerEvent({
                clientX: 16,
                clientY: 20,
                pointerId: 1
            }))
            vi.advanceTimersByTime(200)
            handlers!.onPointerUp(createPointerEvent({ pointerId: 1 }))
        })

        const clickEvent = createMouseEvent()
        handlers!.onClick(clickEvent)

        expect(onClick).toHaveBeenCalledTimes(1)
        expect(onLongPress).not.toHaveBeenCalled()
        expect(clickEvent.preventDefault).toHaveBeenCalledTimes(1)
        expect(clickEvent.stopPropagation).toHaveBeenCalledTimes(1)
    })

    it('fires long press once and suppresses the follow-up click', () => {
        vi.useFakeTimers()
        const onClick = vi.fn()
        const onLongPress = vi.fn()
        let handlers: LongPressHandlers | null = null

        render(
            <LongPressHarness
                onClick={onClick}
                onLongPress={onLongPress}
                onReady={(nextHandlers) => {
                    handlers = nextHandlers
                }}
            />
        )

        expect(handlers).not.toBeNull()

        act(() => {
            handlers!.onPointerDown(createPointerEvent({
                clientX: 24,
                clientY: 32,
                pointerId: 2
            }))
            vi.advanceTimersByTime(600)
            handlers!.onPointerUp(createPointerEvent({ pointerId: 2 }))
        })

        const clickEvent = createMouseEvent()
        handlers!.onClick(clickEvent)

        expect(onLongPress).toHaveBeenCalledWith({ x: 24, y: 32 })
        expect(onLongPress).toHaveBeenCalledTimes(1)
        expect(onClick).not.toHaveBeenCalled()
        expect(clickEvent.preventDefault).toHaveBeenCalledTimes(1)
        expect(clickEvent.stopPropagation).toHaveBeenCalledTimes(1)
    })

    it('suppresses the follow-up click when the pointer moves beyond tolerance', () => {
        vi.useFakeTimers()
        const onClick = vi.fn()
        const onLongPress = vi.fn()
        let handlers: LongPressHandlers | null = null

        render(
            <LongPressHarness
                onClick={onClick}
                onLongPress={onLongPress}
                onReady={(nextHandlers) => {
                    handlers = nextHandlers
                }}
            />
        )

        expect(handlers).not.toBeNull()

        act(() => {
            handlers!.onPointerDown(createPointerEvent({
                clientX: 10,
                clientY: 10,
                pointerId: 3
            }))
            handlers!.onPointerMove(createPointerEvent({
                clientX: 30,
                clientY: 10,
                pointerId: 3
            }))
            vi.advanceTimersByTime(600)
            handlers!.onPointerUp(createPointerEvent({ pointerId: 3 }))
        })

        const clickEvent = createMouseEvent()
        handlers!.onClick(clickEvent)

        expect(onLongPress).not.toHaveBeenCalled()
        expect(onClick).not.toHaveBeenCalled()
        expect(clickEvent.preventDefault).toHaveBeenCalledTimes(1)
        expect(clickEvent.stopPropagation).toHaveBeenCalledTimes(1)
    })
})
