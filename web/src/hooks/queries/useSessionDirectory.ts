import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { DirectoryEntry } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'
import { formatOptionalUserFacingErrorMessage } from '@/lib/userFacingError'
import { useTranslation } from '@/lib/use-translation'

export function useSessionDirectory(
    api: ApiClient | null,
    sessionId: string | null,
    path: string,
    options?: { enabled?: boolean }
): {
    entries: DirectoryEntry[]
    error: string | null
    isLoading: boolean
    refetch: () => Promise<unknown>
} {
    const { t } = useTranslation()
    const resolvedSessionId = sessionId ?? 'unknown'
    const enabled = Boolean(api && sessionId) && (options?.enabled ?? true)

    const query = useQuery({
        queryKey: queryKeys.sessionDirectory(resolvedSessionId, path),
        queryFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }

            const response = await api.listSessionDirectory(sessionId, path)
            if (!response.success) {
                return { entries: [], error: response.error ?? 'Failed to list directory' }
            }

            return { entries: response.entries ?? [], error: null }
        },
        enabled,
    })

    const queryError = formatOptionalUserFacingErrorMessage(query.error, {
        t,
        fallbackKey: 'error.files.directory'
    })

    return {
        entries: query.data?.entries ?? [],
        error: queryError ?? formatOptionalUserFacingErrorMessage(query.data?.error, {
            t,
            fallbackKey: 'error.files.directory'
        }),
        isLoading: query.isLoading,
        refetch: query.refetch
    }
}
