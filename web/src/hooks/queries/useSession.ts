import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { Session } from '@/types/api'
import type { SessionResponse } from '@/types/api'
import { getSessionPlaceholderSeed, type SessionPlaceholderSource } from '@/lib/sessionQueryCache'
import { formatOptionalUserFacingErrorMessage } from '@/lib/userFacingError'
import { useTranslation } from '@/lib/use-translation'
import { createSessionDetailQueryOptions } from './sessionDetailQueryOptions'

export function useSession(api: ApiClient | null, sessionId: string | null): {
    session: Session | null
    isLoading: boolean
    isPlaceholderData: boolean
    hasWarmSnapshot: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const sessionSeed = sessionId == null
        ? { response: undefined, source: null as SessionPlaceholderSource }
        : getSessionPlaceholderSeed(queryClient, sessionId)
    const sessionDetailQueryOptions = createSessionDetailQueryOptions(api, sessionId)
    const query = useQuery({
        enabled: Boolean(api && sessionId),
        placeholderData: () => sessionSeed.response,
        ...sessionDetailQueryOptions,
    })
    const sessionResponse = query.data ?? sessionSeed.response
    const hasSeedOnly = query.data == null && sessionSeed.response != null
    const hasWarmSnapshot = sessionSeed.source === 'warm' && (query.isPlaceholderData || hasSeedOnly)

    return {
        session: sessionResponse?.session ?? null,
        isLoading: query.isLoading && !hasSeedOnly,
        isPlaceholderData: query.isPlaceholderData || hasSeedOnly,
        hasWarmSnapshot,
        error: formatOptionalUserFacingErrorMessage(query.error, {
            t,
            fallbackKey: 'error.session.load'
        }),
        refetch: query.refetch,
    }
}
