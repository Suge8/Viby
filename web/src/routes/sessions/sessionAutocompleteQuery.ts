import type { QueryClient, QueryKey } from '@tanstack/react-query'

const SESSION_AUTOCOMPLETE_QUERY_GC_TIME_MS = 2 * 60 * 1000

const SESSION_AUTOCOMPLETE_QUERY_OPTIONS = {
    staleTime: Infinity,
    gcTime: SESSION_AUTOCOMPLETE_QUERY_GC_TIME_MS,
    retry: false,
} as const

type SessionAutocompleteQueryOptions<TData> = {
    enabled: boolean
    queryClient: QueryClient
    queryKey: QueryKey
    queryFn: () => Promise<TData>
}

export function getOrPrefetchSessionAutocompleteData<TData>(
    options: SessionAutocompleteQueryOptions<TData>
): TData | undefined {
    const { enabled, queryClient, queryFn, queryKey } = options

    const cachedData = queryClient.getQueryData<TData>(queryKey)
    if (cachedData !== undefined) {
        return cachedData
    }

    if (!enabled) {
        return undefined
    }

    const queryState = queryClient.getQueryState<TData>(queryKey)
    if (queryState?.fetchStatus === 'fetching') {
        return undefined
    }

    void queryClient.prefetchQuery({
        queryKey,
        queryFn,
        ...SESSION_AUTOCOMPLETE_QUERY_OPTIONS,
    }).catch(() => {
        // Autocomplete is enhancement-only and should never block the composer.
    })

    return undefined
}
