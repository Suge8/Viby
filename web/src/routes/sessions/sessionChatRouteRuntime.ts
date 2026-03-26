import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { PendingReplyState } from '@/lib/messageWindowStoreCore'
import type { SessionStreamState } from '@/types/api'
import type { Session } from '@/types/api'
import { useSessionTargetResolver } from '@/hooks/useSessionTargetResolver'
import { clearPendingReply } from '@/lib/messageWindowStoreCore'
import { useNoticeCenter } from '@/lib/notice-center'
import { appendRealtimeTrace } from '@/lib/realtimeTrace'
import { writeSessionToQueryCache } from '@/lib/sessionQueryCache'
import { formatUserFacingErrorMessage } from '@/lib/userFacingError'
import { useTranslation } from '@/lib/use-translation'

type PendingReplyTraceDetails = {
    sessionId: string
    waitMs?: number
}

function buildPendingReplyTraceDetails(options: {
    sessionId: string
    requestStartedAt: number | null
    extraDetails?: Record<string, unknown>
}): PendingReplyTraceDetails & Record<string, unknown> {
    const waitMs = options.requestStartedAt !== null
        ? Date.now() - options.requestStartedAt
        : undefined
    return {
        sessionId: options.sessionId,
        ...(waitMs !== undefined ? { waitMs } : {}),
        ...(options.extraDetails ?? {})
    }
}

function formatResumeErrorMessage(error: unknown, t: (key: string) => string): string {
    return formatUserFacingErrorMessage(error, {
        t,
        fallbackKey: 'chat.resumeFailed.generic',
        codeMap: {
            session_archived: 'chat.resumeFailed.sessionArchived',
            resume_unavailable: 'chat.resumeFailed.resumeUnavailable',
            no_machine_online: 'chat.resumeFailed.noMachineOnline',
            session_not_found: 'chat.resumeFailed.sessionNotFound',
            resume_failed: 'chat.resumeFailed.resumeFailed'
        },
        messageMap: [
            {
                match: 'Resume session ID unavailable',
                key: 'chat.resumeFailed.resumeUnavailable'
            }
        ]
    })
}

export function useSessionResumeController(options: {
    api: ApiClient
    queryClient: ReturnType<typeof useQueryClient>
    session: Session
}): {
    ensureSessionReady: () => Promise<void>
    warmSession: () => void
    isResumingSession: boolean
} {
    const { t } = useTranslation()
    const { addToast } = useNoticeCenter()
    const [isResumingSession, setIsResumingSession] = useState(false)
    const mountedRef = useRef(true)
    const resumingCountRef = useRef(0)
    const ensureSessionReadyBase = useSessionTargetResolver({
        api: options.api,
        session: options.session,
        onReady: (resumedSession) => {
            writeSessionToQueryCache(options.queryClient, resumedSession)
        },
        onError: (error, currentSessionId) => {
            addToast({
                title: t('chat.resumeFailed.title'),
                description: formatResumeErrorMessage(error, t),
                tone: 'danger',
                href: `/sessions/${currentSessionId}`
            })
        }
    })

    useEffect(() => {
        return () => {
            mountedRef.current = false
        }
    }, [])

    const ensureSessionReady = useCallback(async () => {
        if (options.session.active) {
            return
        }

        resumingCountRef.current += 1
        if (mountedRef.current) {
            setIsResumingSession(true)
        }

        try {
            await ensureSessionReadyBase()
        } finally {
            resumingCountRef.current = Math.max(0, resumingCountRef.current - 1)
            if (mountedRef.current && resumingCountRef.current === 0) {
                setIsResumingSession(false)
            }
        }
    }, [ensureSessionReadyBase, options.session.active])

    const warmSession = useCallback(() => {
        if (options.session.active) {
            return
        }

        void ensureSessionReadyBase({ silent: true }).catch(() => undefined)
    }, [ensureSessionReadyBase, options.session.active])

    return {
        ensureSessionReady,
        warmSession,
        isResumingSession
    }
}

export function useSessionChatTracing(options: {
    sessionId: string
    thinking: boolean
    pendingReply: PendingReplyState | null
    stream: SessionStreamState | null
}): void {
    const previousThinkingRef = useRef(options.thinking)
    const lastTracedStreamIdRef = useRef<string | null>(null)

    useEffect(() => {
        previousThinkingRef.current = options.thinking
        lastTracedStreamIdRef.current = null
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
                requestStartedAt: options.pendingReply?.requestStartedAt ?? null
            })
        })
        clearPendingReply(options.sessionId, options.pendingReply?.localId)
        previousThinkingRef.current = options.thinking
    }, [
        options.pendingReply?.localId,
        options.pendingReply?.requestStartedAt,
        options.sessionId,
        options.thinking
    ])

    useEffect(() => {
        const stream = options.stream
        if (!stream || stream.text.length === 0) {
            if (!stream) {
                lastTracedStreamIdRef.current = null
            }
            return
        }

        if (lastTracedStreamIdRef.current === stream.streamId) {
            return
        }

        appendRealtimeTrace({
            at: Date.now(),
            type: 'first_stream_delta',
            details: buildPendingReplyTraceDetails({
                sessionId: options.sessionId,
                requestStartedAt: options.pendingReply?.requestStartedAt ?? null,
                extraDetails: {
                    streamId: stream.streamId
                }
            })
        })
        clearPendingReply(options.sessionId, options.pendingReply?.localId)
        lastTracedStreamIdRef.current = stream.streamId
    }, [
        options.pendingReply?.localId,
        options.pendingReply?.requestStartedAt,
        options.sessionId,
        options.stream
    ])
}
