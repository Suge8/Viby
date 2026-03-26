import type { QueryClient } from '@tanstack/react-query'
import { loadMessageWindowStoreModule } from '@/lib/messageWindowStoreModule'
import { SESSION_SCOPED_QUERY_PREFIXES } from '@/lib/query-keys'

const SESSION_SCOPED_QUERY_PREFIX_SET: ReadonlySet<string> = new Set(SESSION_SCOPED_QUERY_PREFIXES)

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
    void loadMessageWindowStoreModule().then(({ clearMessageWindow, clearSessionStream }) => {
        clearSessionStream(sessionId)
        clearMessageWindow(sessionId)
    })
    queryClient.removeQueries({
        predicate: (query) => isSessionScopedQueryKey(query.queryKey, sessionId)
    })
}
