import { useEffect, useRef, useState } from 'react'
import type { AssistantReplyingPhase } from '@/components/AssistantChat/assistantReplyingPhase'

export const REPLYING_INDICATOR_EXIT_DURATION_MS = 140

export type ReplyingIndicatorPresenceState = 'active' | 'exiting'

export type ReplyingIndicatorPresence = {
    visiblePhase: AssistantReplyingPhase | null
    state: ReplyingIndicatorPresenceState
}

export function useReplyingIndicatorPresence(
    phase: AssistantReplyingPhase | null
): ReplyingIndicatorPresence {
    const [visiblePhase, setVisiblePhase] = useState<AssistantReplyingPhase | null>(phase)
    const [state, setState] = useState<ReplyingIndicatorPresenceState>('active')
    const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (exitTimeoutRef.current) {
            clearTimeout(exitTimeoutRef.current)
            exitTimeoutRef.current = null
        }

        if (phase) {
            setVisiblePhase(phase)
            setState('active')
            return
        }

        if (!visiblePhase) {
            return
        }

        setState('exiting')
        exitTimeoutRef.current = setTimeout(() => {
            setVisiblePhase(null)
            setState('active')
            exitTimeoutRef.current = null
        }, REPLYING_INDICATOR_EXIT_DURATION_MS)

        return function cleanup(): void {
            if (!exitTimeoutRef.current) {
                return
            }

            clearTimeout(exitTimeoutRef.current)
            exitTimeoutRef.current = null
        }
    }, [phase, visiblePhase])

    return {
        visiblePhase,
        state
    }
}
