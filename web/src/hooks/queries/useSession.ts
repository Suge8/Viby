import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import {
    getSessionPlaceholderSeed,
    type SessionCacheEntry,
    type SessionPlaceholderSource,
} from '@/lib/sessionQueryCache'
import { useTranslation } from '@/lib/use-translation'
import { formatOptionalUserFacingErrorMessage } from '@/lib/userFacingError'
import type { Session } from '@/types/api'
import { createSessionDetailQueryOptions } from './sessionDetailQueryOptions'

export function useSession(
    api: ApiClient | null,
    sessionId: string | null
): {
    session: Session | null
    isLoading: boolean
    isPlaceholderData: boolean
    isDetailHydrated: boolean
    hasWarmSnapshot: boolean
    error: string | null
} {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const sessionSeed =
        sessionId == null
            ? { response: undefined, source: null as SessionPlaceholderSource, detailHydrated: false }
            : getSessionPlaceholderSeed(queryClient, sessionId)
    const sessionDetailQueryOptions = createSessionDetailQueryOptions(queryClient, api, sessionId)
    const query = useQuery<SessionCacheEntry>({
        enabled: Boolean(api && sessionId),
        placeholderData: () => sessionSeed.response,
        ...sessionDetailQueryOptions,
    })
    const sessionResponse = query.data ?? sessionSeed.response
    const hasSeedOnly = query.data == null && sessionSeed.response != null
    const hasWarmSnapshot = sessionSeed.source === 'warm' && (query.isPlaceholderData || hasSeedOnly)
    const isDetailHydrated =
        query.data?.detailHydrated === true || (query.data == null && sessionSeed.detailHydrated === true)

    return {
        session: sessionResponse?.session ?? null,
        isLoading: query.isLoading && !hasSeedOnly,
        isPlaceholderData: query.isPlaceholderData || hasSeedOnly,
        isDetailHydrated,
        hasWarmSnapshot,
        error: formatOptionalUserFacingErrorMessage(query.error, {
            t,
            fallbackKey: 'error.session.load',
        }),
    }
}
