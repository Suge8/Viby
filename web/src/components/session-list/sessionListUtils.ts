import { compareSessionSummaries } from '@viby/protocol'
import type { SessionSummary } from '@/types/api'

export const RECENTLY_CLOSED_WINDOW_MS = 24 * 60 * 60 * 1000
export const SESSION_ACTION_LONG_PRESS_MS = 500

export type SessionListTab = 'sessions' | 'archived'

export type SessionListSection = {
    id: 'running' | 'recentlyClosed' | 'earlier'
    titleKey: 'sessions.section.running' | 'sessions.section.recentlyClosed' | 'sessions.section.earlier'
    sessions: readonly SessionSummary[]
}

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
    const candidates = sortSessions(
        sessions.filter((session) => session.lifecycleState !== 'archived')
    )
    if (options.preferredSessionId) {
        const preferred = candidates.find((session) => session.id === options.preferredSessionId)
        if (preferred) {
            return preferred.id
        }
    }
    return candidates[0]?.id ?? null
}

export function buildSessionSections(sessions: readonly SessionSummary[]): SessionListSection[] {
    const running = sortSessions(sessions.filter((session) => session.lifecycleState === 'running'))
    const closedSessions = sortSessions(sessions.filter((session) => session.lifecycleState === 'closed'))
    const cutoff = Date.now() - RECENTLY_CLOSED_WINDOW_MS

    const recentlyClosed = closedSessions.filter((session) => session.updatedAt >= cutoff)
    const earlier = closedSessions.filter((session) => session.updatedAt < cutoff)
    const sections: SessionListSection[] = []

    if (running.length > 0) {
        sections.push({
            id: 'running',
            titleKey: 'sessions.section.running',
            sessions: running
        })
    }

    if (recentlyClosed.length > 0) {
        sections.push({
            id: 'recentlyClosed',
            titleKey: 'sessions.section.recentlyClosed',
            sessions: recentlyClosed
        })
    }

    if (earlier.length > 0) {
        sections.push({
            id: 'earlier',
            titleKey: 'sessions.section.earlier',
            sessions: earlier
        })
    }

    return sections
}
