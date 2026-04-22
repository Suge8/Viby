import { type MutableRefObject, type RefObject, useEffect } from 'react'
import { enterControllerSurface } from '@/lib/controllerOwnershipProbe'
import { subscribeForegroundPulse } from '@/lib/foregroundPulse'
import {
    resolveViewportAtBottom,
    TRANSCRIPT_AT_BOTTOM_THRESHOLD_PX,
    type TranscriptFollowMode,
} from './transcriptScrollPolicy'

type FollowState = {
    followModeRef: MutableRefObject<TranscriptFollowMode>
    setFollowMode: (nextMode: TranscriptFollowMode) => void
}

export function useTranscriptVirtuosoControllerSurface(sessionId: string): void {
    useEffect(() => {
        const leaveSurface = enterControllerSurface(`thread-viewport:${sessionId}`, 'virtuoso-transcript')
        return () => {
            leaveSurface()
        }
    }, [sessionId])
}

export function useTranscriptVirtuosoForegroundSync(
    options: {
        viewportRef: RefObject<HTMLDivElement | null>
        reportAtBottom: (atBottom: boolean) => void
        scheduleAutoScrollToBottom: () => void
    } & FollowState
): void {
    useEffect(() => {
        const unsubscribe = subscribeForegroundPulse(() => {
            const actualAtBottom = resolveViewportAtBottom(
                options.viewportRef.current,
                TRANSCRIPT_AT_BOTTOM_THRESHOLD_PX
            )
            if (actualAtBottom) {
                options.followModeRef.current = 'following'
                options.setFollowMode('following')
                options.reportAtBottom(true)
                options.scheduleAutoScrollToBottom()
                return
            }

            if (options.followModeRef.current === 'following') {
                options.scheduleAutoScrollToBottom()
                return
            }

            options.reportAtBottom(false)
        })

        return () => {
            unsubscribe()
        }
    }, [
        options.followModeRef,
        options.reportAtBottom,
        options.scheduleAutoScrollToBottom,
        options.setFollowMode,
        options.viewportRef,
    ])
}
