import type { QueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { loadSessionViewRuntime } from '@/hooks/queries/sessionViewRuntime'
import { queryKeys } from '@/lib/query-keys'
import type { SessionCacheEntry } from '@/lib/sessionQueryCache'
import { realtimeQueryOptions } from './realtimeQueryOptions'

export const SESSION_VIEW_QUERY_GC_TIME_MS = 2 * 60 * 1000

export function createSessionDetailQueryOptions(
    queryClient: QueryClient,
    api: ApiClient | null,
    sessionId: string | null
) {
    return {
        queryKey: queryKeys.session(sessionId ?? 'unknown'),
        queryFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            const sessionView = await loadSessionViewRuntime({
                api,
                queryClient,
                sessionId,
            })
            return {
                session: sessionView.session,
                detailHydrated: true,
            } satisfies SessionCacheEntry
        },
        ...realtimeQueryOptions,
        gcTime: SESSION_VIEW_QUERY_GC_TIME_MS,
    } as const
}
