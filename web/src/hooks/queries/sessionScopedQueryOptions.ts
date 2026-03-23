import type { QueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { clearMessageWindow, clearSessionStream } from '@/lib/message-window-store'
import { queryKeys, SESSION_SCOPED_QUERY_PREFIXES } from '@/lib/query-keys'
import { realtimeQueryOptions } from './realtimeQueryOptions'

export const SESSION_VIEW_QUERY_GC_TIME_MS = 2 * 60 * 1000
const SESSION_SCOPED_QUERY_PREFIX_SET: ReadonlySet<string> = new Set(SESSION_SCOPED_QUERY_PREFIXES)

export const sessionAutocompleteQueryOptions = {
    staleTime: Infinity,
    gcTime: SESSION_VIEW_QUERY_GC_TIME_MS,
    retry: false,
} as const

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

function isSessionScopedQueryKey(queryKey: readonly unknown[], sessionId: string): boolean {
    const prefix = typeof queryKey[0] === 'string' ? queryKey[0] : null
    return prefix !== null
        && SESSION_SCOPED_QUERY_PREFIX_SET.has(prefix)
        && queryKey[1] === sessionId
}

export function disposeSessionViewRuntime(
    queryClient: Pick<QueryClient, 'removeQueries'>,
    sessionId: string
): void {
    clearSessionStream(sessionId)
    clearMessageWindow(sessionId)
    queryClient.removeQueries({
        predicate: (query) => isSessionScopedQueryKey(query.queryKey, sessionId)
    })
}
