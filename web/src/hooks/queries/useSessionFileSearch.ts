import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { FileSearchItem } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'
import { formatOptionalUserFacingErrorMessage } from '@/lib/userFacingError'
import { useTranslation } from '@/lib/use-translation'

export function useSessionFileSearch(
    api: ApiClient | null,
    sessionId: string | null,
    query: string,
    options?: { limit?: number; enabled?: boolean }
): {
    files: FileSearchItem[]
    error: string | null
    isLoading: boolean
    refetch: () => Promise<unknown>
} {
    const { t } = useTranslation()
    const resolvedSessionId = sessionId ?? 'unknown'
    const limit = options?.limit ?? 200
    const enabled = options?.enabled ?? Boolean(api && sessionId)

    const result = useQuery({
        queryKey: queryKeys.sessionFiles(resolvedSessionId, query),
        queryFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            const response = await api.searchSessionFiles(sessionId, query, limit)
            if (!response.success) {
                return { files: [], error: response.error ?? 'Failed to search files' }
            }
            return { files: response.files ?? [], error: null }
        },
        enabled,
    })

    const queryError = formatOptionalUserFacingErrorMessage(result.error, {
        t,
        fallbackKey: 'error.files.search'
    })

    return {
        files: result.data?.files ?? [],
        error: queryError ?? formatOptionalUserFacingErrorMessage(result.data?.error, {
            t,
            fallbackKey: 'error.files.search'
        }),
        isLoading: result.isLoading,
        refetch: result.refetch
    }
}
