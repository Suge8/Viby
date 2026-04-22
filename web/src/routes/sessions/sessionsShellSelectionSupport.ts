import type { SessionListSectionId } from '@/components/session-list/sessionListUtils'
import type { SessionSummary } from '@/types/api'

type SessionSelectionLookupOptions = {
    selectedSessionId: string | null
    sessions: readonly SessionSummary[]
}

type ClearSelectedSessionDetailOptions = {
    activeSectionId: SessionListSectionId
    routeSelectionNeedsSectionSync: boolean
    selectedSectionId: SessionListSectionId | null
    selectedSession: SessionSummary | null
    selectedSessionId: string | null
    sessionsCount: number
    wasSelectedSessionSeen: boolean
}

export function findSelectedSession(options: SessionSelectionLookupOptions): SessionSummary | null {
    if (!options.selectedSessionId) {
        return null
    }

    return options.sessions.find((session) => session.id === options.selectedSessionId) ?? null
}

export function shouldClearSelectedSessionDetail(options: ClearSelectedSessionDetailOptions): boolean {
    if (!options.selectedSessionId || options.routeSelectionNeedsSectionSync) {
        return false
    }

    const selectedSessionMissingFromActiveList =
        !options.selectedSession && (options.sessionsCount > 0 || options.wasSelectedSessionSeen)

    if (selectedSessionMissingFromActiveList) {
        return true
    }

    return options.selectedSectionId !== null && options.selectedSectionId !== options.activeSectionId
}
