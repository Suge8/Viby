import { describe, expect, it } from 'vitest'
import { createTestSessionListSummary } from '@/test/sessionFactories'
import type { SessionSummary } from '@/types/api'
import { findSelectedSession, shouldClearSelectedSessionDetail } from './sessionsShellSelectionSupport'

function createSessionSummary(overrides: Partial<SessionSummary> & Pick<SessionSummary, 'id'>): SessionSummary {
    return createTestSessionListSummary(overrides)
}

describe('sessionsShellSelectionSupport', () => {
    it('finds the currently selected session from the authoritative list', () => {
        const selectedSession = findSelectedSession({
            selectedSessionId: 'session-2',
            sessions: [createSessionSummary({ id: 'session-1' }), createSessionSummary({ id: 'session-2' })],
        })

        expect(selectedSession?.id).toBe('session-2')
    })

    it('clears detail when the selected session is no longer visible in the current section', () => {
        expect(
            shouldClearSelectedSessionDetail({
                activeSectionId: 'running',
                routeSelectionNeedsSectionSync: false,
                selectedSectionId: 'history',
                selectedSession: createSessionSummary({ id: 'session-1', lifecycleState: 'closed' }),
                selectedSessionId: 'session-1',
                sessionsCount: 1,
                wasSelectedSessionSeen: true,
            })
        ).toBe(true)
    })

    it('does not clear detail while the new route selection is still syncing the section owner', () => {
        expect(
            shouldClearSelectedSessionDetail({
                activeSectionId: 'running',
                routeSelectionNeedsSectionSync: true,
                selectedSectionId: 'history',
                selectedSession: createSessionSummary({ id: 'session-1', lifecycleState: 'closed' }),
                selectedSessionId: 'session-1',
                sessionsCount: 1,
                wasSelectedSessionSeen: true,
            })
        ).toBe(false)
    })

    it('clears detail when the selected session disappears after previously being visible', () => {
        expect(
            shouldClearSelectedSessionDetail({
                activeSectionId: 'running',
                routeSelectionNeedsSectionSync: false,
                selectedSectionId: null,
                selectedSession: null,
                selectedSessionId: 'session-1',
                sessionsCount: 0,
                wasSelectedSessionSeen: true,
            })
        ).toBe(true)
    })
})
