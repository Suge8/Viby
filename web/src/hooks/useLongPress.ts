import type React from 'react'
import { useCallback, useEffect, useRef } from 'react'

const DEFAULT_LONG_PRESS_THRESHOLD_MS = 500
const LONG_PRESS_MOVE_TOLERANCE_PX = 10

type UseLongPressOptions = {
    onLongPress: (point: { x: number; y: number }) => void
    onClick?: () => unknown
    threshold?: number
    disabled?: boolean
    enableContextMenu?: boolean
}

type UseLongPressHandlers = {
    onClick: (event: React.MouseEvent) => unknown
    onPointerCancel: React.PointerEventHandler
    onPointerDown: React.PointerEventHandler
    onPointerLeave: React.PointerEventHandler
    onPointerMove: React.PointerEventHandler
    onPointerUp: React.PointerEventHandler
    onContextMenu: React.MouseEventHandler
}

export function useLongPress(options: UseLongPressOptions): UseLongPressHandlers {
    const {
        onLongPress,
        onClick,
        threshold = DEFAULT_LONG_PRESS_THRESHOLD_MS,
        disabled = false,
        enableContextMenu = false,
    } = options

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const activePointerIdRef = useRef<number | null>(null)
    const didLongPressRef = useRef(false)
    const pressPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
    const suppressClickRef = useRef(false)

    const clearTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }
    }, [])

    const resetPointerState = useCallback(() => {
        activePointerIdRef.current = null
    }, [])

    const resetInteractionState = useCallback(() => {
        resetPointerState()
        didLongPressRef.current = false
        suppressClickRef.current = false
    }, [resetPointerState])

    useEffect(() => {
        return () => {
            clearTimer()
            resetInteractionState()
        }
    }, [clearTimer, resetInteractionState])

    const startPress = useCallback(
        (pointerId: number, clientX: number, clientY: number) => {
            if (disabled) {
                return
            }

            clearTimer()
            activePointerIdRef.current = pointerId
            didLongPressRef.current = false
            pressPointRef.current = { x: clientX, y: clientY }

            timerRef.current = setTimeout(() => {
                didLongPressRef.current = true
                suppressClickRef.current = true
                onLongPress(pressPointRef.current)
            }, threshold)
        },
        [clearTimer, disabled, onLongPress, threshold]
    )

    const finishPress = useCallback(() => {
        clearTimer()
        resetPointerState()
    }, [clearTimer, resetPointerState])

    const onPointerDown = useCallback<React.PointerEventHandler>(
        (event) => {
            const { pointerType } = event
            if (event.button !== 0 || event.isPrimary === false) {
                return
            }

            if (pointerType === 'mouse') {
                return
            }

            startPress(event.pointerId, event.clientX, event.clientY)
        },
        [startPress]
    )

    const onPointerMove = useCallback<React.PointerEventHandler>(
        (event) => {
            if (activePointerIdRef.current !== event.pointerId || didLongPressRef.current) {
                return
            }

            const deltaX = Math.abs(event.clientX - pressPointRef.current.x)
            const deltaY = Math.abs(event.clientY - pressPointRef.current.y)
            if (deltaX <= LONG_PRESS_MOVE_TOLERANCE_PX && deltaY <= LONG_PRESS_MOVE_TOLERANCE_PX) {
                return
            }

            clearTimer()
        },
        [clearTimer]
    )

    const onPointerUp = useCallback<React.PointerEventHandler>(
        (event) => {
            if (activePointerIdRef.current !== event.pointerId) {
                return
            }

            finishPress()
        },
        [finishPress]
    )

    const onPointerCancel = useCallback<React.PointerEventHandler>(
        (event) => {
            if (activePointerIdRef.current !== event.pointerId) {
                return
            }

            finishPress()
        },
        [finishPress]
    )

    const onPointerLeave = useCallback<React.PointerEventHandler>(
        (event) => {
            if (activePointerIdRef.current !== event.pointerId) {
                return
            }
            finishPress()
        },
        [finishPress]
    )

    const onClickHandler = useCallback(
        (event: React.MouseEvent) => {
            if (suppressClickRef.current) {
                clearTimer()
                resetInteractionState()
                event.preventDefault()
                event.stopPropagation()
                return undefined
            }

            clearTimer()
            resetPointerState()
            didLongPressRef.current = false
            return onClick?.()
        },
        [clearTimer, onClick, resetInteractionState, resetPointerState]
    ) satisfies (event: React.MouseEvent) => unknown

    const onContextMenu = useCallback<React.MouseEventHandler>(
        (event) => {
            if (disabled || !enableContextMenu) {
                return
            }

            event.preventDefault()
            clearTimer()
            resetPointerState()
            suppressClickRef.current = true

            // `didLongPressRef === true` already means the touch long-press timer
            // fired in this gesture; skip the contextmenu echo so we do not
            // double-trigger onLongPress for touch users whose browsers also
            // synthesize a contextmenu event after the long-press.
            if (didLongPressRef.current) {
                return
            }

            // For mouse right-click there is no pointerdown/up cycle and no
            // follow-up click event that would consume the latched refs (see
            // onPointerDown's mouse early-return). If we latched
            // didLongPressRef = true here, the next right-click on the same card
            // would early-return above and silently swallow the menu. Fire
            // onLongPress and reset the interaction state synchronously so
            // subsequent right-clicks stay responsive.
            onLongPress({ x: event.clientX, y: event.clientY })
            resetInteractionState()
        },
        [clearTimer, disabled, enableContextMenu, onLongPress, resetInteractionState, resetPointerState]
    )

    return {
        onClick: onClickHandler,
        onPointerCancel,
        onPointerDown,
        onPointerLeave,
        onPointerMove,
        onPointerUp,
        onContextMenu,
    }
}
