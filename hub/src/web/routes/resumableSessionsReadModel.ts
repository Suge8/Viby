import { createHash } from 'node:crypto'
import {
    compareSessionSummaries,
    DEFAULT_RESUMABLE_SESSIONS_LIMIT,
    getSessionMessageActivityFromSession,
    MAX_RESUMABLE_SESSIONS_LIMIT,
    type ResumableSessionsSnapshot,
    type SessionSummary,
    toSessionSummary,
} from '@viby/protocol'
import type { SyncEngine } from '../../sync/syncEngine'

export type ResumableSessionsQuery = {
    driver?: 'claude' | 'codex' | 'gemini' | 'opencode' | 'cursor' | 'pi'
    query?: string
    lifecycle?: 'closed' | 'all'
    cursor?: string
    limit?: number
}

type ResumableSessionsPageWindow = {
    sessions: SessionSummary[]
    nextCursor: string | null
    hasMore: boolean
}

function filterResumableSessionSummaries(
    summaries: readonly SessionSummary[],
    filters: ResumableSessionsQuery
): SessionSummary[] {
    const normalizedQuery = filters.query?.toLowerCase() ?? ''
    return summaries.filter((summary) => {
        if (filters.driver && summary.metadata?.driver !== filters.driver) {
            return false
        }
        if ((filters.lifecycle ?? 'closed') !== 'all' && summary.lifecycleState !== 'closed') {
            return false
        }
        if (!normalizedQuery) {
            return true
        }

        const haystack = [summary.metadata?.name, summary.metadata?.summary?.text, summary.metadata?.path, summary.id]
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
            .join('\n')
            .toLowerCase()

        return haystack.includes(normalizedQuery)
    })
}

function sliceResumableSessionSummaries(
    summaries: readonly SessionSummary[],
    cursor: string | undefined,
    limit: number
): ResumableSessionsPageWindow {
    const cursorIndex = cursor ? summaries.findIndex((summary) => summary.id === cursor) : -1
    const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0
    const sessions = summaries.slice(startIndex, startIndex + limit)
    const hasMore = startIndex + sessions.length < summaries.length
    return {
        sessions,
        nextCursor: hasMore ? (sessions.at(-1)?.id ?? null) : null,
        hasMore,
    }
}

function createResumableSessionsRevision(snapshot: ResumableSessionsSnapshot): string {
    return createHash('sha256')
        .update(
            JSON.stringify({
                sessions: snapshot.sessions.map((session) => ({
                    id: session.id,
                    updatedAt: session.updatedAt,
                    latestActivityAt: session.latestActivityAt,
                    lifecycleState: session.lifecycleState,
                    resumeAvailable: session.resumeAvailable,
                    resumeStrategy: session.resumeStrategy,
                    path: session.metadata?.path ?? null,
                    driver: session.metadata?.driver ?? null,
                })),
                page: snapshot.page,
            })
        )
        .digest('base64url')
}

export class ResumableSessionsReadModel {
    private sessionsRevision = -1
    private resumableSummaries: SessionSummary[] = []

    getSnapshot(engine: SyncEngine, query: ResumableSessionsQuery): ResumableSessionsSnapshot {
        this.refreshIfNeeded(engine)

        const filteredSessions = filterResumableSessionSummaries(this.resumableSummaries, query)
        const limit = query.limit ?? DEFAULT_RESUMABLE_SESSIONS_LIMIT
        const pageWindow = sliceResumableSessionSummaries(filteredSessions, query.cursor, limit)
        const snapshot: ResumableSessionsSnapshot = {
            revision: '',
            sessions: pageWindow.sessions,
            page: {
                cursor: query.cursor ?? null,
                nextCursor: pageWindow.nextCursor,
                limit,
                hasMore: pageWindow.hasMore,
            },
        }

        return {
            ...snapshot,
            revision: createResumableSessionsRevision(snapshot),
        }
    }

    private refreshIfNeeded(engine: SyncEngine): void {
        const currentRevision = engine.getSessionsRevision()
        if (currentRevision === this.sessionsRevision) {
            return
        }

        this.sessionsRevision = currentRevision
        this.resumableSummaries = engine
            .getSessions()
            .map((session) => toSessionSummary(session, getSessionMessageActivityFromSession(session)))
            .filter((summary) => summary.resumeAvailable)
            .sort(compareSessionSummaries)
    }
}

export { MAX_RESUMABLE_SESSIONS_LIMIT }
