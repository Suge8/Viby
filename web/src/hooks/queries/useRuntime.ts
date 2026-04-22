import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'
import { useTranslation } from '@/lib/use-translation'
import { formatOptionalUserFacingErrorMessage } from '@/lib/userFacingError'
import type { LocalRuntime } from '@/types/api'
import { realtimeQueryOptions } from './realtimeQueryOptions'

export function useRuntime(
    api: ApiClient | null,
    enabled: boolean,
    options?: {
        refetchOnMount?: boolean | 'always'
    }
): {
    runtime: LocalRuntime | null
    isLoading: boolean
    isFetching: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const { t } = useTranslation()
    const query = useQuery({
        queryKey: queryKeys.runtime,
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.getRuntime()
        },
        enabled: Boolean(api && enabled),
        ...realtimeQueryOptions,
        refetchOnMount: options?.refetchOnMount ?? realtimeQueryOptions.refetchOnMount,
    })

    return {
        runtime: query.data?.runtime ?? null,
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        error: formatOptionalUserFacingErrorMessage(query.error, {
            t,
            fallbackKey: 'error.runtime.load',
        }),
        refetch: query.refetch,
    }
}
