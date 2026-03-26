import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { ApiClient } from '@/api/client'
import type { SessionSummary } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'
import { readSessionsWarmSnapshot, writeSessionsWarmSnapshot } from '@/lib/sessionsWarmSnapshot'
import { formatOptionalUserFacingErrorMessage } from '@/lib/userFacingError'
import { useTranslation } from '@/lib/use-translation'
import { realtimeQueryOptions } from './realtimeQueryOptions'

export function useSessions(api: ApiClient | null): {
    sessions: SessionSummary[]
    isLoading: boolean
    isPlaceholderData: boolean
    hasWarmSnapshot: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const { t } = useTranslation()
    const warmSnapshot = readSessionsWarmSnapshot()
    const query = useQuery({
        queryKey: queryKeys.sessions,
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.getSessions()
        },
        enabled: Boolean(api),
        placeholderData: () => warmSnapshot,
        ...realtimeQueryOptions,
    })
    const sessionsResponse = query.data ?? warmSnapshot
    const hasSeedOnly = query.data == null && warmSnapshot != null
    const hasWarmSnapshot = warmSnapshot != null && (query.isPlaceholderData || hasSeedOnly)

    useEffect(() => {
        if (!query.data) {
            return
        }

        writeSessionsWarmSnapshot(query.data.sessions ?? [])
    }, [query.data])

    return {
        sessions: sessionsResponse?.sessions ?? [],
        isLoading: query.isLoading && !hasSeedOnly,
        isPlaceholderData: query.isPlaceholderData || hasSeedOnly,
        hasWarmSnapshot,
        error: formatOptionalUserFacingErrorMessage(query.error, {
            t,
            fallbackKey: 'error.sessions.load'
        }),
        refetch: query.refetch,
    }
}
