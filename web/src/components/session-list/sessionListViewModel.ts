import type { SessionListSection, SessionListSectionId } from '@/components/session-list/sessionListUtils'
import type { FloatingActionMenuAnchorPoint } from '@/components/ui/FloatingActionMenu.contract'
import { DEFAULT_FLOATING_ACTION_MENU_ANCHOR_POINT } from '@/components/ui/FloatingActionMenu.contract'
import type { SessionSummary } from '@/types/api'

export type SessionListControlTab = {
    id: SessionListSectionId
    titleKey: SessionListSection['titleKey']
    count: number
}

export type SessionActionTarget = {
    sessionId: string | null
    anchorPoint: FloatingActionMenuAnchorPoint
}

export function createClosedActionTarget(): SessionActionTarget {
    return {
        sessionId: null,
        anchorPoint: DEFAULT_FLOATING_ACTION_MENU_ANCHOR_POINT,
    }
}

export function findSessionTargets(
    sessions: readonly SessionSummary[],
    selectedSessionId: string | null,
    actionSessionId: string | null
): {
    actionSession: SessionSummary | null
    selectedSession: SessionSummary | null
} {
    let selectedSession: SessionSummary | null = null
    let actionSession: SessionSummary | null = null

    for (const session of sessions) {
        if (!selectedSession && session.id === selectedSessionId) {
            selectedSession = session
        }

        if (!actionSession && session.id === actionSessionId) {
            actionSession = session
        }

        if (selectedSession && actionSession) {
            break
        }
    }

    return {
        actionSession,
        selectedSession,
    }
}

export function buildSessionListControlTabs(sections: readonly SessionListSection[]): SessionListControlTab[] {
    const countBySectionId = new Map(sections.map((section) => [section.id, section.count]))
    const sectionIds = ['running', 'history'] as const

    return sectionIds.map((sectionId) => {
        return {
            id: sectionId,
            titleKey: sectionId === 'running' ? 'sessions.section.running' : 'sessions.section.history',
            count: countBySectionId.get(sectionId) ?? 0,
        }
    })
}
