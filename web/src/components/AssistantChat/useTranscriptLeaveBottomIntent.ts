import { type MutableRefObject, useCallback, useRef } from 'react'
import { type TranscriptFollowMode } from './transcriptScrollPolicy'

const TOUCH_MANUAL_INTENT_THRESHOLD_PX = 8

type LeaveBottomIntentOptions = {
    enterManualMode: (markNotAtBottom: boolean) => void
    followModeRef: MutableRefObject<TranscriptFollowMode>
}

export function useTranscriptLeaveBottomIntent(options: LeaveBottomIntentOptions) {
    const { enterManualMode, followModeRef } = options
    const touchGestureStartYRef = useRef<number | null>(null)
    const touchManualIntentConsumedRef = useRef(false)

    const clearLeaveBottomIntentFrame = useCallback(() => {
        touchGestureStartYRef.current = null
        touchManualIntentConsumedRef.current = false
    }, [])

    const commitLeaveBottomIntent = useCallback(() => {
        if (followModeRef.current !== 'following') {
            return
        }

        enterManualMode(true)
    }, [enterManualMode, followModeRef])

    const handleViewportWheelCapture = useCallback(
        (event: Pick<WheelEvent, 'deltaY'>) => {
            if (event.deltaY >= 0) {
                return
            }

            commitLeaveBottomIntent()
        },
        [commitLeaveBottomIntent]
    )

    const handleViewportTouchStartCapture = useCallback((event: Pick<TouchEvent, 'touches'>) => {
        const touch = event.touches[0]
        touchGestureStartYRef.current = touch?.clientY ?? null
        touchManualIntentConsumedRef.current = false
    }, [])

    const handleViewportTouchMoveCapture = useCallback(
        (event: Pick<TouchEvent, 'touches'>) => {
            if (touchManualIntentConsumedRef.current) {
                return
            }

            const gestureStartY = touchGestureStartYRef.current
            const currentY = event.touches[0]?.clientY
            if (gestureStartY === null || currentY === undefined) {
                return
            }
            if (currentY - gestureStartY < TOUCH_MANUAL_INTENT_THRESHOLD_PX) {
                return
            }

            touchManualIntentConsumedRef.current = true
            commitLeaveBottomIntent()
        },
        [commitLeaveBottomIntent]
    )

    return {
        clearLeaveBottomIntentFrame,
        handleViewportTouchMoveCapture,
        handleViewportTouchStartCapture,
        handleViewportWheelCapture,
    }
}
