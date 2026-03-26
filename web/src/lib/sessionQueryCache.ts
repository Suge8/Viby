import type { QueryClient } from '@tanstack/react-query'
import type { Session, SessionResponse, SessionsResponse, SessionSummary } from '@/types/api'
import { loadMessageWindowStoreModule } from '@/lib/messageWindowStoreModule'
import { queryKeys } from '@/lib/query-keys'
import {
    markSessionSummaryPendingUserTurn,
    removeSessionSummaryCache,
    upsertSessionSummaryCache
} from '@/lib/realtimeSessionSummaryCache'
import { readSessionWarmSnapshot, removeSessionWarmSnapshot, writeSessionWarmSnapshot } from '@/lib/sessionWarmSnapshot'
import { removeSessionsWarmSnapshot, writeSessionsWarmSnapshot } from '@/lib/sessionsWarmSnapshot'

type SessionFlavor = NonNullable<NonNullable<Session['metadata']>['flavor']> | null
export type SessionPlaceholderSource = 'cache' | 'warm' | 'summary' | null

export function writeSessionToQueryCache(queryClient: QueryClient, session: Session): void {
    queryClient.setQueryData<SessionResponse>(queryKeys.session(session.id), { session })
    writeSessionWarmSnapshot(session)
    queryClient.setQueryData<SessionsResponse | undefined>(queryKeys.sessions, (previous) => {
        const next = upsertSessionSummaryCache(previous, session)
        if (next) {
            writeSessionsWarmSnapshot(next.sessions)
        }
        return next
    })
}

export function markSessionPendingUserTurnInQueryCache(
    queryClient: Pick<QueryClient, 'setQueryData'>,
    sessionId: string,
    createdAt: number
): void {
    queryClient.setQueryData<SessionsResponse | undefined>(queryKeys.sessions, (previous) => {
        const result = markSessionSummaryPendingUserTurn(previous, sessionId, createdAt)
        if (result.next) {
            writeSessionsWarmSnapshot(result.next.sessions)
        }
        return result.next
    })
}

export function removeSessionClientState(
    queryClient: Pick<QueryClient, 'setQueryData' | 'removeQueries'>,
    sessionId: string
): void {
    queryClient.setQueryData<SessionsResponse | undefined>(queryKeys.sessions, (previous) => {
        const next = removeSessionSummaryCache(previous, sessionId)
        if (next) {
            writeSessionsWarmSnapshot(next.sessions)
        } else {
            removeSessionsWarmSnapshot()
        }
        return next
    })
    void queryClient.removeQueries({ queryKey: queryKeys.session(sessionId) })
    removeSessionWarmSnapshot(sessionId)
    void loadMessageWindowStoreModule().then(({ removeMessageWindow }) => {
        removeMessageWindow(sessionId)
    })
}

export function getSessionResponseFromCache(
    queryClient: Pick<QueryClient, 'getQueryData'>,
    sessionId: string
): SessionResponse | undefined {
    return queryClient.getQueryData<SessionResponse>(queryKeys.session(sessionId))
}

export function getSessionSummaryFromCache(
    queryClient: Pick<QueryClient, 'getQueryData'>,
    sessionId: string
): SessionSummary | null {
    const sessionsResponse = queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)
    return sessionsResponse?.sessions.find((session) => session.id === sessionId) ?? null
}

export function createSessionSeedFromSummary(summary: SessionSummary): Session {
    return {
        id: summary.id,
        seq: 0,
        createdAt: summary.activeAt || summary.updatedAt,
        updatedAt: summary.updatedAt,
        active: summary.active,
        activeAt: summary.activeAt,
        metadata: summary.metadata ? {
            path: summary.metadata.path,
            host: '',
            name: summary.metadata.name,
            summary: summary.metadata.summary,
            machineId: summary.metadata.machineId,
            flavor: normalizeSessionSeedFlavor(summary.metadata.flavor),
            worktree: summary.metadata.worktree,
            lifecycleState: summary.lifecycleState,
            lifecycleStateSince: summary.lifecycleStateSince ?? undefined
        } : null,
        metadataVersion: 0,
        agentState: null,
        agentStateVersion: 0,
        thinking: summary.thinking,
        thinkingAt: summary.latestActivityAt ?? summary.updatedAt,
        model: summary.model,
        modelReasoningEffort: summary.modelReasoningEffort,
        permissionMode: summary.permissionMode,
        collaborationMode: summary.collaborationMode,
        todos: undefined,
        teamState: undefined
    }
}

function normalizeSessionSeedFlavor(flavor: string | null | undefined): SessionFlavor {
    switch (flavor) {
        case 'claude':
        case 'codex':
        case 'cursor':
        case 'gemini':
        case 'opencode':
            return flavor
        default:
            return null
    }
}

export function getSessionPlaceholderResponse(
    queryClient: Pick<QueryClient, 'getQueryData'>,
    sessionId: string
): SessionResponse | undefined {
    return getSessionPlaceholderSeed(queryClient, sessionId).response
}

export function getSessionPlaceholderSeed(
    queryClient: Pick<QueryClient, 'getQueryData'>,
    sessionId: string
): {
    response: SessionResponse | undefined
    source: SessionPlaceholderSource
} {
    const cachedResponse = getSessionResponseFromCache(queryClient, sessionId)
    if (cachedResponse) {
        return {
            response: cachedResponse,
            source: 'cache'
        }
    }

    const warmSnapshot = readSessionWarmSnapshot(sessionId)
    if (warmSnapshot) {
        return {
            response: warmSnapshot,
            source: 'warm'
        }
    }

    const cachedSummary = getSessionSummaryFromCache(queryClient, sessionId)
    if (!cachedSummary) {
        return {
            response: undefined,
            source: null
        }
    }

    return {
        response: {
            session: createSessionSeedFromSummary(cachedSummary)
        },
        source: 'summary'
    }
}
