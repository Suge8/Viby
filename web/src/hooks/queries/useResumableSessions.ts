import { type InfiniteData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'
import { useTranslation } from '@/lib/use-translation'
import { formatOptionalUserFacingErrorMessage } from '@/lib/userFacingError'
import type {
    ResumableSessionsPage,
    ResumableSessionsResponse,
    ResumableSessionsSnapshot,
    SessionSummary,
} from '@/types/api'
import { realtimeQueryOptions } from './realtimeQueryOptions'

type UseResumableSessionsOptions = {
    driver?: string | null
    query?: string | null
    lifecycle?: 'closed' | 'all'
    limit?: number | null
}

export function useResumableSessions(
    api: ApiClient | null,
    options: UseResumableSessionsOptions = {}
): {
    sessions: SessionSummary[]
    page: ResumableSessionsPage | null
    isLoading: boolean
    isFetching: boolean
    isLoadingMore: boolean
    hasMore: boolean
    error: string | null
    refetch: () => Promise<unknown>
    loadMore: () => Promise<unknown>
} {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const queryKey = queryKeys.resumableSessions({
        driver: options.driver,
        query: options.query,
        lifecycle: options.lifecycle,
        limit: options.limit,
    })
    const query = useInfiniteQuery<ResumableSessionsSnapshot>({
        queryKey,
        initialPageParam: null,
        queryFn: async ({ pageParam }) => {
            if (!api) {
                throw new Error('API unavailable')
            }

            const current = queryClient.getQueryData<InfiniteData<ResumableSessionsSnapshot>>(queryKey)
            const cachedPage = getCachedResumablePage(current, pageParam)
            const response = await api.getResumableSessions(
                {
                    ...options,
                    cursor: typeof pageParam === 'string' ? pageParam : null,
                },
                cachedPage?.revision
            )
            if (response.notModified && cachedPage?.revision === response.revision) {
                return cachedPage
            }

            return assertResumableSessionsSnapshot(response)
        },
        getNextPageParam: (lastPage) => lastPage.page.nextCursor,
        enabled: Boolean(api),
        ...realtimeQueryOptions,
    })
    const flattenedSessions = flattenResumablePages(query.data)
    const currentPage = query.data?.pages.at(-1)?.page ?? null

    return {
        sessions: flattenedSessions,
        page: currentPage,
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        isLoadingMore: query.isFetchingNextPage,
        hasMore: currentPage?.hasMore ?? false,
        error: formatOptionalUserFacingErrorMessage(query.error, {
            t,
            fallbackKey: 'error.sessions.load',
        }),
        refetch: query.refetch,
        loadMore: async () => await query.fetchNextPage(),
    }
}

function assertResumableSessionsSnapshot(response: ResumableSessionsResponse): ResumableSessionsSnapshot {
    if (response.notModified) {
        throw new Error('Resumable sessions snapshot missing cached page')
    }

    return response
}

function getCachedResumablePage(
    data: InfiniteData<ResumableSessionsSnapshot> | undefined,
    pageParam: unknown
): ResumableSessionsSnapshot | undefined {
    if (!data) {
        return undefined
    }

    const normalizedCursor = typeof pageParam === 'string' ? pageParam : null
    const pageIndex = data.pageParams.findIndex((value) => {
        const candidateCursor = typeof value === 'string' ? value : null
        return candidateCursor === normalizedCursor
    })

    return pageIndex >= 0 ? data.pages[pageIndex] : undefined
}

function flattenResumablePages(data: InfiniteData<ResumableSessionsSnapshot> | undefined): SessionSummary[] {
    if (!data) {
        return []
    }

    return data.pages.flatMap((page) => page.sessions)
}
