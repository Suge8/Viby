import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SessionSummary } from '@/types/api'
import { useNewSessionDirectoryState } from './useNewSessionDirectoryState'

const runtimePathsExistsHarness = vi.hoisted(() => ({
    lastPaths: [] as string[],
}))

vi.mock('@/hooks/useRuntimePathsExists', () => ({
    useRuntimePathsExists: (_api: unknown, paths: string[]) => {
        runtimePathsExistsHarness.lastPaths = paths
        return {
            pathExistence: Object.fromEntries(paths.map((path) => [path, true])),
            checkPathsExists: vi.fn(async (pathsToCheck: string[]) =>
                Object.fromEntries(pathsToCheck.map((path) => [path, true]))
            ),
        }
    },
}))

vi.mock('./useDirectorySuggestionsInput', () => ({
    useDirectorySuggestionsInput: () => ({
        suggestions: [],
        selectedIndex: -1,
        handleDirectoryBlur: vi.fn(),
        handleDirectoryChange: vi.fn(),
        handleDirectoryFocus: vi.fn(),
        handleDirectoryKeyDown: vi.fn(),
        handleSuggestionSelect: vi.fn(),
    }),
}))

describe('useNewSessionDirectoryState', () => {
    it('keeps known-path existence checks interaction-driven', async () => {
        const sessions = [
            {
                id: 'session-1',
                metadata: {
                    path: '/session',
                },
            } as SessionSummary,
        ]

        const { result } = renderHook(() =>
            useNewSessionDirectoryState({
                api: {} as never,
                runtime: { id: 'runtime-1', active: true, metadata: null },
                sessions,
                isDisabled: false,
                sessionType: 'simple',
                t: (key) => key,
                getRecentPaths: () => ['/recent', '/other'],
            })
        )

        await waitFor(() => {
            expect(runtimePathsExistsHarness.lastPaths).toEqual(['/recent'])
        })

        act(() => {
            result.current.directorySectionProps.input.onDirectoryFocus()
        })

        await waitFor(() => {
            expect(runtimePathsExistsHarness.lastPaths).toEqual(['/recent', '/other', '/session'])
        })
    })
})
