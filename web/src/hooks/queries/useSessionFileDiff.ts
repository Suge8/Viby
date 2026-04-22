import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { createSessionFileDiffQueryOptions } from '@/hooks/queries/sessionFileQueryOptions'

export function useSessionFileDiff(
    api: ApiClient | null,
    sessionId: string | null,
    filePath: string,
    staged?: boolean
) {
    return useQuery({
        ...createSessionFileDiffQueryOptions(api, sessionId, filePath, staged),
        enabled: Boolean(api && sessionId && filePath),
    })
}
