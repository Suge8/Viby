import type { QueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { clearMessageWindow, clearSessionStream } from '@/lib/message-window-store'
import { SESSION_SCOPED_QUERY_PREFIXES } from '@/lib/query-keys'
import { writeSessionViewToQueryCache } from '@/lib/sessionQueryCache'
import type { SessionViewSnapshot } from '@/types/api'

const SESSION_SCOPED_QUERY_PREFIX_SET: ReadonlySet<string> = new Set(SESSION_SCOPED_QUERY_PREFIXES)
const inFlightSessionViewLoads = new Map<string, Promise<SessionViewSnapshot>>()

function isSessionScopedQueryKey(queryKey: readonly unknown[], sessionId: string): boolean {
    const prefix = typeof queryKey[0] === 'string' ? queryKey[0] : null
    return prefix !== null && SESSION_SCOPED_QUERY_PREFIX_SET.has(prefix) && queryKey[1] === sessionId
}

export function loadSessionViewRuntime(options: {
    api: ApiClient | null
    queryClient: QueryClient
    sessionId: string
}): Promise<SessionViewSnapshot> {
    if (!options.api) {
        return Promise.reject(new Error('Session unavailable'))
    }

    const current = inFlightSessionViewLoads.get(options.sessionId)
    if (current) {
        return current
    }

    const next = options.api
        .getSessionView(options.sessionId)
        .then((sessionView) => {
            writeSessionViewToQueryCache(options.queryClient, sessionView)
            return sessionView
        })
        .finally(() => {
            if (inFlightSessionViewLoads.get(options.sessionId) === next) {
                inFlightSessionViewLoads.delete(options.sessionId)
            }
        })

    inFlightSessionViewLoads.set(options.sessionId, next)
    return next
}

export function readSessionViewRuntimeLoad(sessionId: string): Promise<SessionViewSnapshot> | null {
    return inFlightSessionViewLoads.get(sessionId) ?? null
}

export function clearSessionViewRuntimeLoad(sessionId: string): void {
    inFlightSessionViewLoads.delete(sessionId)
}

export function disposeSessionViewRuntime(queryClient: Pick<QueryClient, 'removeQueries'>, sessionId: string): void {
    clearSessionViewRuntimeLoad(sessionId)
    clearSessionStream(sessionId)
    clearMessageWindow(sessionId)
    queryClient.removeQueries({
        predicate: (query) => isSessionScopedQueryKey(query.queryKey, sessionId),
    })
}
