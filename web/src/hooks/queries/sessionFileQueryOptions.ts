import { queryOptions } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function createSessionFileDiffQueryOptions(
    api: ApiClient | null,
    sessionId: string | null,
    filePath: string,
    staged?: boolean
) {
    return queryOptions({
        queryKey: queryKeys.gitFileDiff(sessionId ?? 'unknown', filePath, staged),
        queryFn: async () => {
            if (!api || !sessionId || !filePath) {
                throw new Error('Missing session or path')
            }

            return await api.getGitDiffFile(sessionId, filePath, staged)
        },
    })
}

export function createSessionFileContentQueryOptions(
    api: ApiClient | null,
    sessionId: string | null,
    filePath: string
) {
    return queryOptions({
        queryKey: queryKeys.sessionFile(sessionId ?? 'unknown', filePath),
        queryFn: async () => {
            if (!api || !sessionId || !filePath) {
                throw new Error('Missing session or path')
            }

            return await api.readSessionFile(sessionId, filePath)
        },
    })
}
