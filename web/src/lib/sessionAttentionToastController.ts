import type { QueryClient } from '@tanstack/react-query'
import {
    type ActiveSessionTurnState,
    getActiveSessionTurnState,
    getPendingRequestsCount,
    presentSessionAttentionNotification,
} from '@viby/protocol'
import type { Notice } from '@/lib/notice-center'
import { getSessionTitle } from '@/lib/sessionPresentation'
import { getSessionResponseFromCache, getSessionSummaryFromCache } from '@/lib/sessionQueryCache'
import type { Session, SessionSummary } from '@/types/api'

type TranslationFn = (key: string, params?: Record<string, string | number>) => string

type SessionToastKind = 'ready' | 'permission-request'

export type SessionAttentionSnapshot = {
    sessionId: string
    title: string
    turnState: ActiveSessionTurnState
    latestCompletedReplyAt: number | null
    pendingRequestsCount: number
    requestIds: readonly string[] | null
}

type SessionAttentionToast = Pick<Notice, 'title' | 'description' | 'tone' | 'href'>

function getRequestIds(session: Session | null): readonly string[] | null {
    const requests = session?.agentState?.requests
    return requests ? Object.keys(requests).sort() : null
}

function getPendingCount(session: Session | null, summary: SessionSummary | null): number {
    return summary?.pendingRequestsCount ?? (session ? getPendingRequestsCount(session.agentState) : 0)
}

export function readSessionAttentionSnapshot(
    queryClient: Pick<QueryClient, 'getQueryData'>,
    sessionId: string,
    options: { requestIds?: readonly string[]; pendingRequestsCount?: number } = {}
): SessionAttentionSnapshot | null {
    const summary = getSessionSummaryFromCache(queryClient, sessionId)
    const session = getSessionResponseFromCache(queryClient, sessionId)?.session ?? null
    const source = session ?? summary
    if (!source) {
        return null
    }

    const latestActivityAt = summary?.latestActivityAt ?? session?.latestActivityAt ?? null
    const latestActivityKind = summary?.latestActivityKind ?? session?.latestActivityKind ?? null
    const latestCompletedReplyAt = summary?.latestCompletedReplyAt ?? session?.latestCompletedReplyAt ?? null
    const pendingRequestsCount = options.pendingRequestsCount ?? getPendingCount(session, summary)
    return {
        sessionId,
        title: getSessionTitle(source),
        turnState: getActiveSessionTurnState({
            thinking: session?.thinking ?? summary?.thinking ?? false,
            activeAt: session?.activeAt ?? summary?.activeAt ?? null,
            pendingRequestsCount,
            latestActivityAt,
            latestActivityKind,
            latestCompletedReplyAt,
        }),
        latestCompletedReplyAt,
        pendingRequestsCount,
        requestIds: options.requestIds ?? getRequestIds(session),
    }
}

function hasNewRequest(before: SessionAttentionSnapshot, after: SessionAttentionSnapshot): boolean {
    if (after.requestIds && before.requestIds) {
        const previousIds = new Set(before.requestIds)
        return after.requestIds.some((requestId) => !previousIds.has(requestId))
    }

    return after.pendingRequestsCount > before.pendingRequestsCount
}

function resolveSessionToastKind(
    before: SessionAttentionSnapshot,
    after: SessionAttentionSnapshot
): SessionToastKind | null {
    if (hasNewRequest(before, after)) {
        return 'permission-request'
    }

    if (
        after.latestCompletedReplyAt !== null &&
        after.latestCompletedReplyAt !== before.latestCompletedReplyAt &&
        before.turnState === 'processing' &&
        after.turnState === 'awaiting-input'
    ) {
        return 'ready'
    }

    return null
}

export function presentSessionAttentionToast(options: {
    before: SessionAttentionSnapshot | null
    after: SessionAttentionSnapshot | null
    selectedSessionId: string | null
    t: TranslationFn
}): SessionAttentionToast | null {
    const { before, after, selectedSessionId, t } = options
    if (!before || !after || after.sessionId === selectedSessionId) {
        return null
    }

    const kind = resolveSessionToastKind(before, after)
    if (!kind) {
        return null
    }

    return presentSessionAttentionNotification(
        {
            kind,
            sessionId: after.sessionId,
            sessionTitle: after.title,
        },
        t
    ).toast
}
