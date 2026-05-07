import { useMemo } from 'react'
import type { SessionSummary } from '@/types/api'

function normalizePath(value: string | null | undefined): string | null {
    const path = value?.trim()
    return path ? path : null
}

function compactPaths(paths: Array<string | null | undefined>): string[] {
    return paths.flatMap((path) => {
        const normalized = normalizePath(path)
        return normalized ? [normalized] : []
    })
}

export function useDirectorySuggestions(sessions: SessionSummary[], recentPaths: string[]): string[] {
    return useMemo(() => {
        const sessionPaths = compactPaths(sessions.map((session) => session.metadata?.path))
        const worktreePaths = compactPaths(sessions.map((session) => session.metadata?.worktree?.basePath))
        const dedupedRecent = [...new Set(compactPaths(recentPaths))]
        const recentSet = new Set(dedupedRecent)
        const otherPaths = [...new Set([...sessionPaths, ...worktreePaths])]
            .filter((path) => !recentSet.has(path))
            .sort((a, b) => a.localeCompare(b))

        return [...dedupedRecent, ...otherPaths]
    }, [sessions, recentPaths])
}
