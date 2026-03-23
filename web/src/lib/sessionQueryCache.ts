import type { QueryClient } from '@tanstack/react-query'
import type { Session, SessionResponse, SessionsResponse, SessionSummary } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'
import { upsertSessionSummaryCache } from '@/lib/realtimeSessionSummaryCache'

type SessionFlavor = NonNullable<NonNullable<Session['metadata']>['flavor']> | null

export function writeSessionToQueryCache(queryClient: QueryClient, session: Session): void {
    queryClient.setQueryData<SessionResponse>(queryKeys.session(session.id), { session })
    queryClient.setQueryData<SessionsResponse | undefined>(queryKeys.sessions, (previous) => {
        return upsertSessionSummaryCache(previous, session)
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
    const cachedResponse = getSessionResponseFromCache(queryClient, sessionId)
    if (cachedResponse) {
        return cachedResponse
    }

    const cachedSummary = getSessionSummaryFromCache(queryClient, sessionId)
    if (!cachedSummary) {
        return undefined
    }

    return {
        session: createSessionSeedFromSummary(cachedSummary)
    }
}
