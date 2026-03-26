import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { Machine } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'
import { formatOptionalUserFacingErrorMessage } from '@/lib/userFacingError'
import { useTranslation } from '@/lib/use-translation'
import { realtimeQueryOptions } from './realtimeQueryOptions'

export function useMachines(api: ApiClient | null, enabled: boolean): {
    machines: Machine[]
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const { t } = useTranslation()
    const query = useQuery({
        queryKey: queryKeys.machines,
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.getMachines()
        },
        enabled: Boolean(api && enabled),
        ...realtimeQueryOptions,
    })

    return {
        machines: query.data?.machines ?? [],
        isLoading: query.isLoading,
        error: formatOptionalUserFacingErrorMessage(query.error, {
            t,
            fallbackKey: 'error.machines.load'
        }),
        refetch: query.refetch,
    }
}
