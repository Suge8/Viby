import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createTestSessionSummary } from '@/test/sessionFactories'
import { useDirectorySuggestions } from './useDirectorySuggestions'

describe('useDirectorySuggestions', () => {
    it('normalizes and dedupes recent, session, and worktree paths', () => {
        const sessions = [
            createTestSessionSummary({
                id: 'session-1',
                metadata: { path: ' /repo ', worktree: { basePath: ' /base ', branch: 'main', name: 'base' } },
            }),
            createTestSessionSummary({
                id: 'session-2',
                metadata: { path: '/base', worktree: { basePath: ' ', branch: 'main', name: 'blank' } },
            }),
        ]

        const { result } = renderHook(() => useDirectorySuggestions(sessions, [' /recent ', '/repo', '']))

        expect(result.current).toEqual(['/recent', '/repo', '/base'])
    })
})
