import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { createSessionFileContentQueryOptions } from '@/hooks/queries/sessionFileQueryOptions'

export function useSessionFileContent(
    api: ApiClient | null,
    sessionId: string | null,
    filePath: string,
    options?: { enabled?: boolean }
) {
    return useQuery({
        ...createSessionFileContentQueryOptions(api, sessionId, filePath),
        enabled: Boolean(api && sessionId && filePath) && (options?.enabled ?? true),
    })
}
