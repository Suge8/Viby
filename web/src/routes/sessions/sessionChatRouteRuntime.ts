import { useEffect, useRef } from 'react'
import type { PendingReplyState } from '@/lib/messageWindowStoreCore'
import { appendRealtimeTrace } from '@/lib/realtimeTrace'
import type { SessionStreamState } from '@/types/api'

function buildPendingReplyTraceDetails(options: {
    sessionId: string
    requestStartedAt: number | null
    extraDetails?: Record<string, unknown>
}): Record<string, unknown> {
    const waitMs = options.requestStartedAt !== null ? Date.now() - options.requestStartedAt : undefined
    return {
        sessionId: options.sessionId,
        ...(waitMs !== undefined ? { waitMs } : {}),
        ...(options.extraDetails ?? {}),
    }
}

export function useSessionChatTracing(options: {
    sessionId: string
    thinking: boolean
    pendingReply: PendingReplyState | null
    stream: SessionStreamState | null
}): void {
    const previousThinkingRef = useRef(options.thinking)
    const lastTracedAssistantTurnIdRef = useRef<string | null>(null)
    const requestStartedAt = options.pendingReply?.requestStartedAt ?? null

    useEffect(() => {
        previousThinkingRef.current = options.thinking
        lastTracedAssistantTurnIdRef.current = null
    }, [options.sessionId])

    useEffect(() => {
        if (!options.thinking || previousThinkingRef.current) {
            previousThinkingRef.current = options.thinking
            return
        }

        appendRealtimeTrace({
            at: Date.now(),
            type: 'thinking_visible',
            details: buildPendingReplyTraceDetails({
                sessionId: options.sessionId,
                requestStartedAt,
            }),
        })
        previousThinkingRef.current = options.thinking
    }, [options.sessionId, options.thinking, requestStartedAt])

    useEffect(() => {
        const stream = options.stream
        if (!stream || stream.text.length === 0) {
            if (!stream) {
                lastTracedAssistantTurnIdRef.current = null
            }
            return
        }

        if (lastTracedAssistantTurnIdRef.current === stream.assistantTurnId) {
            return
        }

        appendRealtimeTrace({
            at: Date.now(),
            type: 'first_stream_delta',
            details: buildPendingReplyTraceDetails({
                sessionId: options.sessionId,
                requestStartedAt,
                extraDetails: {
                    assistantTurnId: stream.assistantTurnId,
                },
            }),
        })
        lastTracedAssistantTurnIdRef.current = stream.assistantTurnId
    }, [options.sessionId, options.stream, requestStartedAt])
}
