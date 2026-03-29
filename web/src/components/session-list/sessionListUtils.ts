import { compareSessionSummaries } from '@viby/protocol'
import type { SessionSummary } from '@/types/api'

export const RECENTLY_CLOSED_WINDOW_MS = 24 * 60 * 60 * 1000
export const SESSION_ACTION_LONG_PRESS_MS = 500

export type SessionListTab = 'sessions' | 'archived'

export type SessionListSection = {
    id: 'running' | 'recentlyClosed' | 'earlier'
    titleKey: 'sessions.section.running' | 'sessions.section.recentlyClosed' | 'sessions.section.earlier'
    count: number
    rows: readonly SessionListRow[]
}

export type SessionListSessionRow = {
    kind: 'session'
    id: string
    session: SessionSummary
    anchorSession: SessionSummary
}

export type SessionListManagerGroupRow = {
    kind: 'manager-group'
    id: string
    manager: SessionSummary
    members: readonly SessionSummary[]
    anchorSession: SessionSummary
}

export type SessionListRow = SessionListSessionRow | SessionListManagerGroupRow

type MutableManagerGroupSlot = {
    kind: 'group-slot'
    managerSessionId: string
    manager: SessionSummary | null
    members: SessionSummary[]
    anchorSession: SessionSummary
}

type MutableSessionListRow = SessionListSessionRow | MutableManagerGroupSlot

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
    const cutoff = Date.now() - RECENTLY_CLOSED_WINDOW_MS
    const running: SessionListRow[] = []
    const recentlyClosed: SessionListRow[] = []
    const earlier: SessionListRow[] = []
    let runningCount = 0
    let recentlyClosedCount = 0
    let earlierCount = 0

    for (const row of buildSessionRows(sessions.filter((session) => session.lifecycleState !== 'archived'))) {
        if (row.anchorSession.lifecycleState === 'running') {
            running.push(row)
            runningCount += getSessionListRowCount(row)
            continue
        }

        if (row.anchorSession.updatedAt >= cutoff) {
            recentlyClosed.push(row)
            recentlyClosedCount += getSessionListRowCount(row)
            continue
        }

        earlier.push(row)
        earlierCount += getSessionListRowCount(row)
    }

    const sections: SessionListSection[] = []

    if (running.length > 0) {
        sections.push({
            id: 'running',
            titleKey: 'sessions.section.running',
            count: runningCount,
            rows: running
        })
    }

    if (recentlyClosed.length > 0) {
        sections.push({
            id: 'recentlyClosed',
            titleKey: 'sessions.section.recentlyClosed',
            count: recentlyClosedCount,
            rows: recentlyClosed
        })
    }

    if (earlier.length > 0) {
        sections.push({
            id: 'earlier',
            titleKey: 'sessions.section.earlier',
            count: earlierCount,
            rows: earlier
        })
    }

    return sections
}

export function buildSessionRows(sessions: readonly SessionSummary[]): SessionListRow[] {
    const rows: MutableSessionListRow[] = []
    const managerGroupSlots = new Map<string, MutableManagerGroupSlot>()

    for (const session of sortSessions(sessions)) {
        const managerSessionId = getManagerSessionId(session)
        if (!managerSessionId) {
            rows.push(createSessionRow(session))
            continue
        }

        const existingSlot = managerGroupSlots.get(managerSessionId)
        if (!existingSlot) {
            const slot = createManagerGroupSlot(managerSessionId, session)
            managerGroupSlots.set(managerSessionId, slot)
            rows.push(slot)
            continue
        }

        updateManagerGroupSlot(existingSlot, session)
    }

    return rows.flatMap<SessionListRow>((row) => {
        if (row.kind === 'session') {
            return [row]
        }

        if (!row.manager) {
            return sortSessions(row.members).map(createSessionRow)
        }

        return [{
            kind: 'manager-group',
            id: row.managerSessionId,
            manager: row.manager,
            members: sortSessions(row.members),
            anchorSession: row.anchorSession
        }]
    })
}

function createSessionRow(session: SessionSummary): SessionListSessionRow {
    return {
        kind: 'session',
        id: session.id,
        session,
        anchorSession: session
    }
}

function createManagerGroupSlot(
    managerSessionId: string,
    session: SessionSummary
): MutableManagerGroupSlot {
    return {
        kind: 'group-slot',
        managerSessionId,
        manager: isManagerSession(session) ? session : null,
        members: isManagerSession(session) ? [] : [session],
        anchorSession: session
    }
}

function updateManagerGroupSlot(slot: MutableManagerGroupSlot, session: SessionSummary): void {
    if (compareSessionSummaries(session, slot.anchorSession) < 0) {
        slot.anchorSession = session
    }

    if (isManagerSession(session)) {
        slot.manager = session
        return
    }

    slot.members.push(session)
}

function getSessionListRowCount(row: SessionListRow): number {
    if (row.kind === 'manager-group') {
        return row.members.length + 1
    }

    return 1
}

function getManagerSessionId(session: SessionSummary): string | null {
    const team = session.team
    if (!team) {
        return null
    }

    if (team.sessionRole === 'manager') {
        return session.id
    }

    return team.sessionRole === 'member' ? team.managerSessionId : null
}

function isManagerSession(session: SessionSummary): boolean {
    return session.team?.sessionRole === 'manager'
}
