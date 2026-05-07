import { describe, expect, it } from 'vitest'
import { createTestSessionListSummary } from '@/test/sessionFactories'
import { buildSessionSections, SESSION_LIST_HISTORY_PREVIEW_LIMIT, sessionMatchesListQuery } from './sessionListUtils'

function createHistorySession(index: number) {
    return createTestSessionListSummary({
        id: `history-${index}`,
        lifecycleState: 'closed',
        lifecycleStateSince: 1_000 - index,
        updatedAt: 1_000 - index,
        latestActivityAt: 1_000 - index,
        latestCompletedReplyAt: 1_000 - index,
        metadata: {
            path: `/workspace/project-${index}`,
            driver: 'codex',
            summary: { text: `History ${index}`, updatedAt: 1_000 - index },
        },
    })
}

describe('sessionListUtils', () => {
    it('matches search queries across title, path, summary, driver, and model fields', () => {
        const session = createTestSessionListSummary({
            id: 'session-search',
            metadata: {
                path: '/Users/sugeh/Project/Viby',
                driver: 'claude',
                summary: { text: 'Investigate queued lifecycle', updatedAt: 1 },
            },
            model: 'sonnet',
        })

        expect(sessionMatchesListQuery(session, 'viby queued')).toBe(true)
        expect(sessionMatchesListQuery(session, 'claude sonnet')).toBe(true)
        expect(sessionMatchesListQuery(session, 'missing')).toBe(false)
    })

    it('limits history preview while preserving the selected row outside the preview window', () => {
        const sessions = Array.from({ length: SESSION_LIST_HISTORY_PREVIEW_LIMIT + 2 }, (_value, index) =>
            createHistorySession(index)
        )
        const selectedSessionId = `history-${SESSION_LIST_HISTORY_PREVIEW_LIMIT + 1}`

        const history = buildSessionSections(sessions, { selectedSessionId }).find(
            (section) => section.id === 'history'
        )

        expect(history?.count).toBe(sessions.length)
        expect(history?.rows).toHaveLength(SESSION_LIST_HISTORY_PREVIEW_LIMIT)
        expect(history?.rows.map((row) => row.id)).toContain(selectedSessionId)
        expect(history?.hiddenCount).toBe(2)
    })

    it('shows full matching history while search is active', () => {
        const sessions = [
            ...Array.from({ length: SESSION_LIST_HISTORY_PREVIEW_LIMIT + 2 }, (_value, index) =>
                createHistorySession(index)
            ),
            createTestSessionListSummary({
                id: 'running-match',
                active: true,
                thinking: true,
                lifecycleState: 'running',
                metadata: {
                    path: '/workspace/live',
                    driver: 'codex',
                    summary: { text: 'Live queue', updatedAt: 1 },
                },
            }),
        ]

        const sections = buildSessionSections(sessions, { searchQuery: 'history' })
        const history = sections.find((section) => section.id === 'history')

        expect(sections.find((section) => section.id === 'running')).toBeUndefined()
        expect(history?.rows).toHaveLength(SESSION_LIST_HISTORY_PREVIEW_LIMIT + 2)
        expect(history?.hiddenCount).toBe(0)
    })
})
