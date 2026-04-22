import { cleanup, render } from '@testing-library/react'
import type React from 'react'
import { useEffect } from 'react'
import { afterEach, vi } from 'vitest'
import { useLongPress } from './useLongPress'

export type LongPressHandlers = ReturnType<typeof useLongPress>

type LongPressHarnessProps = {
    disabled?: boolean
    enableContextMenu?: boolean
    onClick?: () => void
    onLongPress?: (point: { x: number; y: number }) => void
    onReady: (handlers: LongPressHandlers) => void
}

export function LongPressHarness(props: LongPressHarnessProps): null {
    const handlers = useLongPress({
        disabled: props.disabled,
        enableContextMenu: props.enableContextMenu,
        onClick: props.onClick,
        onLongPress: props.onLongPress ?? (() => {}),
    })

    useEffect(() => {
        props.onReady(handlers)
    }, [handlers, props])

    return null
}

export function renderLongPressHarness(props: LongPressHarnessProps): void {
    render(<LongPressHarness {...props} />)
}

export function createPointerEvent(
    overrides: Partial<{
        button: number
        clientX: number
        clientY: number
        isPrimary: boolean
        pointerId: number
        pointerType: string
    }> = {}
): React.PointerEvent<Element> {
    return {
        button: overrides.button ?? 0,
        clientX: overrides.clientX ?? 0,
        clientY: overrides.clientY ?? 0,
        isPrimary: overrides.isPrimary ?? true,
        pointerId: overrides.pointerId ?? 1,
        pointerType: overrides.pointerType ?? 'touch',
    } as React.PointerEvent<Element>
}

export function createMouseEvent(): React.MouseEvent<Element> & {
    clientX: number
    clientY: number
    preventDefault: ReturnType<typeof vi.fn>
    stopPropagation: ReturnType<typeof vi.fn>
} {
    const preventDefault = vi.fn()
    const stopPropagation = vi.fn()

    return {
        clientX: 0,
        clientY: 0,
        preventDefault,
        stopPropagation,
    } as React.MouseEvent<Element> & {
        clientX: number
        clientY: number
        preventDefault: ReturnType<typeof vi.fn>
        stopPropagation: ReturnType<typeof vi.fn>
    }
}

export function setupLongPressHarness(props: Omit<LongPressHarnessProps, 'onReady'>): LongPressHandlers {
    let handlers: LongPressHandlers | null = null

    renderLongPressHarness({
        ...props,
        onReady: (nextHandlers) => {
            handlers = nextHandlers
        },
    })

    if (handlers === null) {
        throw new Error('Expected long-press handlers to be ready')
    }

    return handlers
}

afterEach(() => {
    cleanup()
    vi.useRealTimers()
})
