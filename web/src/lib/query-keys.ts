export const SESSION_SCOPED_QUERY_PREFIXES = [
    'session',
    'command-capabilities',
    'git-status',
    'session-files',
    'session-directory',
    'session-file',
    'git-file-diff',
] as const

export const queryKeys = {
    sessions: ['sessions'] as const,
    resumableSessions: (filters: {
        driver?: string | null
        query?: string | null
        lifecycle?: 'closed' | 'all'
        limit?: number | null
    }) =>
        [
            'resumable-sessions',
            filters.driver ?? '',
            filters.query ?? '',
            filters.lifecycle ?? 'closed',
            filters.limit ?? '',
        ] as const,
    session: (sessionId: string) => ['session', sessionId] as const,
    messages: (sessionId: string) => ['messages', sessionId] as const,
    runtime: ['runtime'] as const,
    runtimeAgentAvailability: (directory: string) => ['runtime-agent-availability', directory] as const,
    runtimeDirectory: (path: string) => ['runtime-directory', path] as const,
    gitStatus: (sessionId: string) => ['git-status', sessionId] as const,
    sessionFiles: (sessionId: string, query: string) => ['session-files', sessionId, query] as const,
    sessionDirectory: (sessionId: string, path: string) => ['session-directory', sessionId, path] as const,
    sessionFile: (sessionId: string, path: string) => ['session-file', sessionId, path] as const,
    gitFileDiff: (sessionId: string, path: string, staged?: boolean) =>
        ['git-file-diff', sessionId, path, staged ? 'staged' : 'unstaged'] as const,
    commandCapabilities: (sessionId: string) => ['command-capabilities', sessionId] as const,
}
