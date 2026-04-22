import type { QueryClient } from '@tanstack/react-query'
import { resolveCommandCapabilityScopeKey } from '@viby/protocol'
import { hydrateLatestMessagesFromSessionView, removeMessageWindow } from '@/lib/message-window-store'
import { queryKeys } from '@/lib/query-keys'
import {
    markSessionSummaryPendingUserTurn,
    removeSessionSummaryCache,
    upsertSessionSummaryCache,
} from '@/lib/realtimeSessionSummaryCache'
import {
    attachPersistedResumeAvailability,
    buildSessionPlaceholderSession,
    resolvePersistedResumeAvailability,
} from '@/lib/sessionQueryCacheSupport'
import { removeSessionsWarmSnapshot, writeSessionsWarmSnapshot } from '@/lib/sessionsWarmSnapshot'
import { readSessionWarmSnapshot, removeSessionWarmSnapshot, writeSessionWarmSnapshot } from '@/lib/sessionWarmSnapshot'
import type { Session, SessionResponse, SessionSummary, SessionsResponse, SessionViewSnapshot } from '@/types/api'

export type SessionPlaceholderSource = 'cache' | 'warm' | 'summary' | null
export type SessionCacheEntry = SessionResponse & {
    detailHydrated?: boolean
}

function createSessionCacheEntry(
    session: Session,
    options: Readonly<{ detailHydrated?: boolean }> = {}
): SessionCacheEntry {
    return options.detailHydrated ? { session, detailHydrated: true } : { session }
}

function writeSessionCacheEntry(queryClient: QueryClient, entry: SessionCacheEntry): void {
    const nextSession = entry.session
    const previousSession = getSessionResponseFromCache(queryClient, nextSession.id)?.session ?? null
    const previousScope = resolveCommandCapabilityScopeKey(previousSession?.metadata)
    const nextScope = resolveCommandCapabilityScopeKey(nextSession.metadata)

    queryClient.setQueryData<SessionCacheEntry>(queryKeys.session(nextSession.id), entry)
    if (previousScope !== nextScope) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.commandCapabilities(nextSession.id) })
    }
    writeSessionWarmSnapshot(nextSession)
    queryClient.setQueryData<SessionsResponse | undefined>(queryKeys.sessions, (previous) => {
        const next = upsertSessionSummaryCache(previous, nextSession)
        if (next) {
            writeSessionsWarmSnapshot(next.sessions)
        }
        return next
    })
}

export function writeSessionToQueryCache(queryClient: QueryClient, session: Session): void {
    const nextSession = attachResumeAvailability(queryClient, session)
    const detailHydrated = getSessionCacheEntry(queryClient, session.id)?.detailHydrated === true
    writeSessionCacheEntry(queryClient, createSessionCacheEntry(nextSession, { detailHydrated }))
}

export function patchSessionInQueryCache(
    queryClient: QueryClient,
    sessionId: string,
    updater: (session: Session) => Session
): Session | null {
    const currentEntry = getSessionCacheEntry(queryClient, sessionId)
    if (!currentEntry) {
        return null
    }

    const nextSession = attachResumeAvailability(queryClient, updater(currentEntry.session))
    if (nextSession === currentEntry.session) {
        return nextSession
    }

    writeSessionCacheEntry(
        queryClient,
        createSessionCacheEntry(nextSession, { detailHydrated: currentEntry.detailHydrated === true })
    )
    return nextSession
}

export function writeSessionViewToQueryCache(queryClient: QueryClient, sessionView: SessionViewSnapshot): void {
    const nextSession = attachResumeAvailability(queryClient, sessionView.session)
    writeSessionCacheEntry(queryClient, createSessionCacheEntry(nextSession, { detailHydrated: true }))
    hydrateLatestMessagesFromSessionView({
        sessionId: sessionView.session.id,
        messages: sessionView.latestWindow.messages,
        hasMore: sessionView.latestWindow.page.hasMore,
        stream: sessionView.stream,
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
    removeMessageWindow(sessionId)
}

export function getSessionCacheEntry(
    queryClient: Pick<QueryClient, 'getQueryData'>,
    sessionId: string
): SessionCacheEntry | undefined {
    return queryClient.getQueryData<SessionCacheEntry>(queryKeys.session(sessionId))
}

export function getSessionResponseFromCache(
    queryClient: Pick<QueryClient, 'getQueryData'>,
    sessionId: string
): SessionResponse | undefined {
    return getSessionCacheEntry(queryClient, sessionId)
}

export function getSessionSummaryFromCache(
    queryClient: Pick<QueryClient, 'getQueryData'>,
    sessionId: string
): SessionSummary | null {
    const sessionsResponse = queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)
    return sessionsResponse?.sessions.find((session) => session.id === sessionId) ?? null
}

function attachResumeAvailability(queryClient: Pick<QueryClient, 'getQueryData'>, session: Session): Session {
    return attachPersistedResumeAvailability(session, getPersistedResumeAvailability(queryClient, session))
}

export function createSessionSeedFromSummary(summary: SessionSummary): Session {
    return buildSessionPlaceholderSession(summary)
}

function getPersistedResumeAvailability(
    queryClient: Pick<QueryClient, 'getQueryData'>,
    session: Session
): boolean | undefined {
    return resolvePersistedResumeAvailability({
        session,
        cachedSession: getSessionResponseFromCache(queryClient, session.id)?.session,
        summary: getSessionSummaryFromCache(queryClient, session.id),
    })
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
    detailHydrated: boolean
} {
    const cachedResponse = getSessionCacheEntry(queryClient, sessionId)
    if (cachedResponse) {
        return {
            response: cachedResponse,
            source: 'cache',
            detailHydrated: cachedResponse.detailHydrated === true,
        }
    }

    const warmSnapshot = readSessionWarmSnapshot(sessionId)
    if (warmSnapshot) {
        return {
            response: warmSnapshot,
            source: 'warm',
            detailHydrated: false,
        }
    }

    const cachedSummary = getSessionSummaryFromCache(queryClient, sessionId)
    if (!cachedSummary) {
        return {
            response: undefined,
            source: null,
            detailHydrated: false,
        }
    }

    return {
        response: {
            session: createSessionSeedFromSummary(cachedSummary),
        },
        source: 'summary',
        detailHydrated: false,
    }
}
