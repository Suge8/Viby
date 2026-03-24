import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { Session } from '@/types/api'
import type { SessionResponse } from '@/types/api'
import { getSessionPlaceholderResponse } from '@/lib/sessionQueryCache'
import { createSessionDetailQueryOptions } from './sessionDetailQueryOptions'

function getSessionErrorMessage(error: unknown): string | null {
    if (error instanceof Error) {
        return error.message
    }

    return error ? 'Failed to load session' : null
}

export function useSession(api: ApiClient | null, sessionId: string | null): {
    session: Session | null
    isLoading: boolean
    isPlaceholderData: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const queryClient = useQueryClient()
    const sessionSeed = sessionId == null
        ? undefined
        : getSessionPlaceholderResponse(queryClient, sessionId)
    const sessionDetailQueryOptions = createSessionDetailQueryOptions(api, sessionId)
    const query = useQuery({
        enabled: Boolean(api && sessionId),
        placeholderData: () => sessionSeed,
        ...sessionDetailQueryOptions,
    })
    const sessionResponse = query.data ?? sessionSeed
    const hasCacheSeedOnly = query.data == null && sessionSeed != null

    return {
        session: sessionResponse?.session ?? null,
        isLoading: query.isLoading && !hasCacheSeedOnly,
        isPlaceholderData: query.isPlaceholderData || hasCacheSeedOnly,
        error: getSessionErrorMessage(query.error),
        refetch: query.refetch,
    }
}
