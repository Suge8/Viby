import type React from 'react'
import { useCallback, useEffect, useRef } from 'react'

const DEFAULT_LONG_PRESS_THRESHOLD_MS = 500
const LONG_PRESS_MOVE_TOLERANCE_PX = 10

type UseLongPressOptions = {
    onLongPress: (point: { x: number; y: number }) => void
    onClick?: () => void
    threshold?: number
    disabled?: boolean
    enableContextMenu?: boolean
}

type UseLongPressHandlers = {
    onClick: React.MouseEventHandler
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
    const movedBeyondToleranceRef = useRef(false)
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
        movedBeyondToleranceRef.current = false
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
            movedBeyondToleranceRef.current = false
            pressPointRef.current = { x: clientX, y: clientY }

            timerRef.current = setTimeout(() => {
                didLongPressRef.current = true
                suppressClickRef.current = true
                onLongPress(pressPointRef.current)
            }, threshold)
        },
        [clearTimer, disabled, onLongPress, threshold]
    )

    const finishPress = useCallback(
        (shouldTriggerClick: boolean) => {
            clearTimer()

            if (shouldTriggerClick && !didLongPressRef.current && !movedBeyondToleranceRef.current && onClick) {
                suppressClickRef.current = true
                onClick()
            }

            resetPointerState()
        },
        [clearTimer, onClick, resetPointerState]
    )

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

            movedBeyondToleranceRef.current = true
            suppressClickRef.current = true
            clearTimer()
        },
        [clearTimer]
    )

    const onPointerUp = useCallback<React.PointerEventHandler>(
        (event) => {
            if (activePointerIdRef.current !== event.pointerId) {
                return
            }

            finishPress(true)
        },
        [finishPress]
    )

    const onPointerCancel = useCallback<React.PointerEventHandler>(
        (event) => {
            if (activePointerIdRef.current !== event.pointerId) {
                return
            }

            finishPress(false)
        },
        [finishPress]
    )

    const onPointerLeave = useCallback<React.PointerEventHandler>(
        (event) => {
            if (activePointerIdRef.current !== event.pointerId) {
                return
            }
            finishPress(false)
        },
        [finishPress]
    )

    const onClickHandler = useCallback<React.MouseEventHandler>(
        (event) => {
            if (suppressClickRef.current) {
                clearTimer()
                resetInteractionState()
                event.preventDefault()
                event.stopPropagation()
                return
            }

            clearTimer()
            resetPointerState()
            didLongPressRef.current = false
            onClick?.()
        },
        [clearTimer, onClick, resetInteractionState, resetPointerState]
    )

    const onContextMenu = useCallback<React.MouseEventHandler>(
        (event) => {
            if (disabled || !enableContextMenu) {
                return
            }

            event.preventDefault()
            clearTimer()
            resetPointerState()
            suppressClickRef.current = true

            if (didLongPressRef.current) {
                return
            }

            didLongPressRef.current = true
            onLongPress({ x: event.clientX, y: event.clientY })
        },
        [clearTimer, disabled, enableContextMenu, onLongPress]
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
