import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'
import { realtimeQueryOptions } from './realtimeQueryOptions'

export const SESSION_VIEW_QUERY_GC_TIME_MS = 2 * 60 * 1000

export function createSessionDetailQueryOptions(
    api: ApiClient | null,
    sessionId: string | null
) {
    return {
        queryKey: queryKeys.session(sessionId ?? 'unknown'),
        queryFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            return await api.getSession(sessionId)
        },
        ...realtimeQueryOptions,
        gcTime: SESSION_VIEW_QUERY_GC_TIME_MS,
    } as const
}
