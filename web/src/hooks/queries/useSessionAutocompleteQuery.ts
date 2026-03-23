import { useQuery, useQueryClient, type QueryKey, type UseQueryResult } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { sessionAutocompleteQueryOptions } from './sessionScopedQueryOptions'

type SessionAutocompleteQueryOptions<TData> = {
    enabled: boolean
    queryKey: QueryKey
    queryFn: () => Promise<TData>
}

type SessionAutocompleteQueryResult<TData> = {
    ensureLoaded: () => void
    query: UseQueryResult<TData>
}

export function useSessionAutocompleteQuery<TData>(
    options: SessionAutocompleteQueryOptions<TData>
): SessionAutocompleteQueryResult<TData> {
    const { enabled, queryFn, queryKey } = options
    const queryClient = useQueryClient()
    const queryOptions = useMemo(() => ({
        queryKey,
        queryFn,
        enabled: false,
        ...sessionAutocompleteQueryOptions,
    }), [queryFn, queryKey])
    const query = useQuery(queryOptions)

    const ensureLoaded = useCallback(() => {
        if (!enabled || query.data !== undefined || query.isFetching) {
            return
        }

        void queryClient.prefetchQuery(queryOptions).catch(() => {
            // Autocomplete data is an enhancement only.
        })
    }, [enabled, query.data, query.isFetching, queryClient, queryOptions])

    return {
        ensureLoaded,
        query
    }
}
