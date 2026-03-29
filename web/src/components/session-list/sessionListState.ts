import { useEffect } from 'react'
import type {
    Dispatch,
    MutableRefObject,
    SetStateAction
} from 'react'
import type { SessionSummary } from '@/types/api'
import {
    DEFAULT_FLOATING_ACTION_MENU_ANCHOR_POINT,
    type FloatingActionMenuAnchorPoint
} from '@/components/ui/FloatingActionMenu.contract'
import type { SessionListTab } from '@/components/session-list/sessionListUtils'

export type SessionActionTarget = {
    sessionId: string | null
    anchorPoint: FloatingActionMenuAnchorPoint
}

export type SessionListDerivedData = {
    archivedSessions: SessionSummary[]
    mainSessions: SessionSummary[]
    selectedSession: SessionSummary | null
    actionSession: SessionSummary | null
}

export type ExpandedManagerGroups = Record<string, boolean>

export function createClosedActionTarget(): SessionActionTarget {
    return {
        sessionId: null,
        anchorPoint: DEFAULT_FLOATING_ACTION_MENU_ANCHOR_POINT
    }
}

export function resolveInitialActiveTab(
    sessions: readonly SessionSummary[],
    selectedSessionId: string | null
): SessionListTab {
    if (!selectedSessionId) {
        return 'sessions'
    }

    const selectedSession = sessions.find((session) => session.id === selectedSessionId)
    return selectedSession?.lifecycleState === 'archived' ? 'archived' : 'sessions'
}

export function deriveSessionListData(
    sessions: readonly SessionSummary[],
    selectedSessionId: string | null,
    actionSessionId: string | null
): SessionListDerivedData {
    const archivedSessions: SessionSummary[] = []
    const mainSessions: SessionSummary[] = []
    let selectedSession: SessionSummary | null = null
    let actionSession: SessionSummary | null = null

    for (const session of sessions) {
        if (session.lifecycleState === 'archived') {
            archivedSessions.push(session)
        } else {
            mainSessions.push(session)
        }

        if (session.id === selectedSessionId) {
            selectedSession = session
        }
        if (session.id === actionSessionId) {
            actionSession = session
        }
    }

    return {
        archivedSessions,
        mainSessions,
        selectedSession,
        actionSession
    }
}

export function useSelectedSessionTabSync(
    selectedSession: SessionSummary | null,
    selectedSessionId: string | null,
    setActiveTab: Dispatch<SetStateAction<SessionListTab>>,
    previousSelectedSessionIdRef: MutableRefObject<string | null>,
    previousSelectedLifecycleStateRef: MutableRefObject<SessionSummary['lifecycleState'] | null>
): void {
    useEffect(() => {
        const previousSelectedSessionId = previousSelectedSessionIdRef.current
        previousSelectedSessionIdRef.current = selectedSessionId

        if (previousSelectedSessionId === selectedSessionId) {
            return
        }

        if (selectedSessionId === selectedSession?.id && selectedSession.lifecycleState === 'archived') {
            setActiveTab('archived')
        }
    }, [previousSelectedSessionIdRef, selectedSession, selectedSessionId, setActiveTab])

    useEffect(() => {
        const currentLifecycleState = selectedSession?.lifecycleState ?? null
        const previousLifecycleState = previousSelectedLifecycleStateRef.current

        previousSelectedLifecycleStateRef.current = currentLifecycleState

        if (previousLifecycleState !== 'archived') {
            return
        }

        if (currentLifecycleState && currentLifecycleState !== 'archived') {
            setActiveTab('sessions')
        }
    }, [previousSelectedLifecycleStateRef, selectedSession, setActiveTab])
}

export function useAutoExpandSelectedMemberGroup(
    selectedSession: SessionSummary | null,
    setExpandedManagerGroups: Dispatch<SetStateAction<ExpandedManagerGroups>>
): void {
    useEffect(() => {
        if (!selectedSession) {
            return
        }

        if (selectedSession.team?.sessionRole !== 'member') {
            return
        }

        const managerSessionId = selectedSession.team.managerSessionId
        setExpandedManagerGroups((current) => {
            if (current[managerSessionId]) {
                return current
            }

            return {
                ...current,
                [managerSessionId]: true
            }
        })
    }, [selectedSession, setExpandedManagerGroups])
}
