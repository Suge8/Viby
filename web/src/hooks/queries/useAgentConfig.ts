import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'
import { realtimeQueryOptions } from './realtimeQueryOptions'

export function useAgentConfig(api: ApiClient | null) {
    return useQuery({
        queryKey: queryKeys.agentConfig,
        queryFn: async () => {
            if (!api) throw new Error('API unavailable')
            return await api.getAgentConfig()
        },
        enabled: Boolean(api),
        ...realtimeQueryOptions,
    })
}
