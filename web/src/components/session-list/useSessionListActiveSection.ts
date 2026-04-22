import { useCallback, useEffect, useRef, useState } from 'react'
import type { SessionListSection } from '@/components/session-list/sessionListUtils'
import {
    DEFAULT_SESSION_LIST_SECTION_ID,
    getDefaultSectionId,
    type SessionListSectionId,
} from '@/components/session-list/sessionListUtils'

type UseSessionListActiveSectionOptions = {
    activeSectionId?: SessionListSectionId | null
    onActiveSectionChange?: (sectionId: SessionListSectionId) => void
    preferredSectionId?: SessionListSectionId | null
    sections: readonly SessionListSection[]
    selectedSessionId: string | null
    selectedSectionId: SessionListSectionId | null
}

type UseSessionListActiveSectionResult = {
    activeSectionId: SessionListSectionId
    setActiveSectionId: (sectionId: SessionListSectionId) => void
}

export function useSessionListActiveSection(
    options: UseSessionListActiveSectionOptions
): UseSessionListActiveSectionResult {
    const controlledActiveSectionId = options.activeSectionId ?? null
    const onActiveSectionChange = options.onActiveSectionChange
    const [uncontrolledActiveSectionId, setUncontrolledActiveSectionId] = useState<SessionListSectionId>(() => {
        return options.preferredSectionId ?? getDefaultSectionId(options.sections, options.selectedSectionId)
    })
    const activeSectionId = controlledActiveSectionId ?? uncontrolledActiveSectionId
    const previousSelectedSessionIdRef = useRef<string | null>(options.selectedSessionId)
    const previousSectionsCountRef = useRef(options.sections.length)

    const setActiveSectionId = useCallback(
        (nextSectionId: SessionListSectionId) => {
            if (controlledActiveSectionId === null) {
                setUncontrolledActiveSectionId(nextSectionId)
            }
            onActiveSectionChange?.(nextSectionId)
        },
        [controlledActiveSectionId, onActiveSectionChange]
    )

    useEffect(() => {
        if (options.selectedSessionId === previousSelectedSessionIdRef.current || !options.selectedSectionId) {
            return
        }

        previousSelectedSessionIdRef.current = options.selectedSessionId
        setActiveSectionId(options.selectedSectionId)
    }, [options.selectedSectionId, options.selectedSessionId, setActiveSectionId])

    useEffect(() => {
        if (!options.preferredSectionId || controlledActiveSectionId !== null) {
            return
        }

        setActiveSectionId(options.preferredSectionId)
    }, [controlledActiveSectionId, options.preferredSectionId, setActiveSectionId])

    useEffect(() => {
        const previousSectionsCount = previousSectionsCountRef.current
        previousSectionsCountRef.current = options.sections.length

        if (options.sections.some((section) => section.id === activeSectionId) || options.sections.length === 0) {
            return
        }

        if (previousSectionsCount !== 0) {
            return
        }

        setActiveSectionId(getDefaultSectionId(options.sections, options.selectedSectionId))
    }, [activeSectionId, options.sections, options.selectedSectionId, setActiveSectionId])

    return {
        activeSectionId: activeSectionId ?? DEFAULT_SESSION_LIST_SECTION_ID,
        setActiveSectionId,
    }
}
