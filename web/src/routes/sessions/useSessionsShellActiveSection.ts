import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    DEFAULT_SESSION_LIST_SECTION_ID,
    getSessionListSectionId,
    type SessionListSectionId,
} from '@/components/session-list/sessionListUtils'
import { findSelectedSession } from '@/routes/sessions/sessionsShellSelectionSupport'
import type { SessionSummary } from '@/types/api'

type UseSessionsShellActiveSectionOptions = {
    searchSection: SessionListSectionId | undefined
    selectedSessionId: string | null
    sessions: readonly SessionSummary[]
}

type UseSessionsShellActiveSectionResult = {
    activeSectionId: SessionListSectionId
    selectedSectionId: SessionListSectionId | null
    selectedSession: SessionSummary | null
    routeSelectionNeedsSectionSync: boolean
    wasSelectedSessionSeen: boolean
    handleActiveSectionChange: (sectionId: SessionListSectionId) => void
}

function resolveInitialActiveSectionId(searchSection: SessionListSectionId | undefined): SessionListSectionId {
    return searchSection ?? DEFAULT_SESSION_LIST_SECTION_ID
}

export function useSessionsShellActiveSection(
    options: UseSessionsShellActiveSectionOptions
): UseSessionsShellActiveSectionResult {
    const { searchSection, selectedSessionId, sessions } = options
    const previousSelectionSessionIdRef = useRef<string | null>(selectedSessionId)
    const selectedSessionSeenInListRef = useRef<string | null>(null)
    const [activeSectionId, setActiveSectionId] = useState<SessionListSectionId>(() =>
        resolveInitialActiveSectionId(searchSection)
    )
    const selectedSession = useMemo(() => {
        return findSelectedSession({
            selectedSessionId,
            sessions,
        })
    }, [selectedSessionId, sessions])
    const selectedSectionId = getSessionListSectionId(selectedSession)
    const selectedSessionSeen = selectedSessionSeenInListRef.current === selectedSessionId
    const routeSelectionNeedsSectionSync =
        selectedSectionId !== null &&
        (selectedSessionId !== previousSelectionSessionIdRef.current ||
            (selectedSessionId !== null && !selectedSessionSeen && selectedSectionId !== activeSectionId))
    const wasSelectedSessionSeen = selectedSessionSeen

    const handleActiveSectionChange = useCallback((sectionId: SessionListSectionId) => {
        setActiveSectionId(sectionId)
    }, [])

    useEffect(() => {
        if (!searchSection) {
            return
        }

        setActiveSectionId(searchSection)
    }, [searchSection])

    useEffect(() => {
        const previousSessionId = previousSelectionSessionIdRef.current
        const selectionChanged = selectedSessionId !== previousSessionId
        if (selectionChanged) {
            previousSelectionSessionIdRef.current = selectedSessionId
            selectedSessionSeenInListRef.current = null
        }

        if (!selectedSessionId || !selectedSectionId) {
            return
        }

        if (selectionChanged || selectedSessionSeenInListRef.current !== selectedSessionId) {
            setActiveSectionId(selectedSectionId)
        }
    }, [selectedSectionId, selectedSessionId])

    useEffect(() => {
        if (!selectedSessionId) {
            selectedSessionSeenInListRef.current = null
            return
        }

        if (selectedSession) {
            selectedSessionSeenInListRef.current = selectedSessionId
        }
    }, [selectedSession, selectedSessionId])

    return {
        activeSectionId,
        selectedSectionId,
        selectedSession,
        routeSelectionNeedsSectionSync,
        wasSelectedSessionSeen,
        handleActiveSectionChange,
    }
}
