import { compareSessionSummaries, isSessionRunningSectionLifecycleState } from '@viby/protocol'
import type { SessionSummary } from '@/types/api'

export const SESSION_ACTION_LONG_PRESS_MS = 500
export const DEFAULT_SESSION_LIST_SECTION_ID = 'running'
export const SESSION_LIST_SECTION_IDS = ['running', 'history'] as const
export type SessionListSectionId = (typeof SESSION_LIST_SECTION_IDS)[number]

export type SessionListSection = {
    id: SessionListSectionId
    titleKey: 'sessions.section.history' | 'sessions.section.running'
    count: number
    rows: readonly SessionListRow[]
}

export type SessionListSessionRow = {
    kind: 'session'
    id: string
    session: SessionSummary
    anchorSession: SessionSummary
}

export function getSessionListSectionId(session: SessionSummary | null): SessionListSectionId | null {
    if (!session) {
        return null
    }

    return isSessionRunningSectionLifecycleState(session.lifecycleState) ? 'running' : 'history'
}

export function getDefaultSectionId(
    sections: readonly SessionListSection[],
    preferredSectionId: SessionListSectionId | null
): SessionListSectionId {
    if (preferredSectionId && sections.some((section) => section.id === preferredSectionId)) {
        return preferredSectionId
    }

    return sections[0]?.id ?? DEFAULT_SESSION_LIST_SECTION_ID
}

export type SessionListRow = SessionListSessionRow

export function formatRelativeTime(
    value: number,
    t: (key: string, params?: Record<string, string | number>) => string
): string | null {
    const milliseconds = value < 1_000_000_000_000 ? value * 1000 : value
    if (!Number.isFinite(milliseconds)) {
        return null
    }

    const delta = Date.now() - milliseconds
    if (delta < 60_000) {
        return t('session.time.justNow')
    }

    const minutes = Math.floor(delta / 60_000)
    if (minutes < 60) {
        return t('session.time.minutesAgo', { n: minutes })
    }

    const hours = Math.floor(minutes / 60)
    if (hours < 24) {
        return t('session.time.hoursAgo', { n: hours })
    }

    const days = Math.floor(hours / 24)
    if (days < 7) {
        return t('session.time.daysAgo', { n: days })
    }

    return new Date(milliseconds).toLocaleDateString()
}

function sortSessions(sessions: readonly SessionSummary[]): SessionSummary[] {
    return [...sessions].sort(compareSessionSummaries)
}

export function getLikelyNextSessionId(
    sessions: readonly SessionSummary[],
    options: Readonly<{ preferredSessionId?: string | null }> = {}
): string | null {
    const candidates = sortSessions(sessions)
    if (options.preferredSessionId) {
        const preferred = candidates.find((session) => session.id === options.preferredSessionId)
        if (preferred) {
            return preferred.id
        }
    }
    return candidates[0]?.id ?? null
}

export function buildSessionSections(sessions: readonly SessionSummary[]): SessionListSection[] {
    const running: SessionListRow[] = []
    const history: SessionListRow[] = []
    let runningCount = 0
    let historyCount = 0

    for (const row of buildSessionRows(sessions)) {
        if (isSessionRunningSectionLifecycleState(row.anchorSession.lifecycleState)) {
            running.push(row)
            runningCount += getSessionListRowCount(row)
            continue
        }

        history.push(row)
        historyCount += getSessionListRowCount(row)
    }

    const sections: SessionListSection[] = []

    if (running.length > 0) {
        sections.push({
            id: 'running',
            titleKey: 'sessions.section.running',
            count: runningCount,
            rows: running,
        })
    }

    if (history.length > 0) {
        sections.push({
            id: 'history',
            titleKey: 'sessions.section.history',
            count: historyCount,
            rows: history,
        })
    }

    return sections
}

export function buildSessionRows(sessions: readonly SessionSummary[]): SessionListRow[] {
    return sortSessions(sessions).map(createSessionRow)
}

function createSessionRow(session: SessionSummary): SessionListSessionRow {
    return {
        kind: 'session',
        id: session.id,
        session,
        anchorSession: session,
    }
}

function getSessionListRowCount(row: SessionListRow): number {
    return 1
}
