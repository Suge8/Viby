import { useQuery } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'
import type { ApiClient } from '@/api/client'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { queryKeys } from '@/lib/query-keys'
import { useTranslation } from '@/lib/use-translation'
import { formatOptionalUserFacingErrorMessage } from '@/lib/userFacingError'
import type { AgentAvailability } from '@/types/api'

const AGENT_AVAILABILITY_DIRECTORY_DEBOUNCE_MS = 200
const AGENT_AVAILABILITY_DRIVER_KEY = 'all'
const AGENT_AVAILABILITY_STALE_TIME_MS = 60_000

export function useRuntimeAgentAvailability(
    api: ApiClient | null,
    directory?: string | null
): {
    agents: readonly AgentAvailability[]
    isLoading: boolean
    isRefreshing: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const { t } = useTranslation()
    const rawDirectory = directory?.trim() ?? ''
    const normalizedDirectory = useDebouncedValue(rawDirectory, AGENT_AVAILABILITY_DIRECTORY_DEBOUNCE_MS)
    const forceRefreshRef = useRef(false)
    const query = useQuery({
        queryKey: queryKeys.runtimeCapabilities(normalizedDirectory, AGENT_AVAILABILITY_DRIVER_KEY, 'availability'),
        enabled: Boolean(api),
        staleTime: AGENT_AVAILABILITY_STALE_TIME_MS,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        queryFn: async ({ signal }) => {
            if (!api) throw new Error('API unavailable')
            const forceRefresh = forceRefreshRef.current
            forceRefreshRef.current = false
            return await api.getRuntimeCapabilities({
                ...(normalizedDirectory ? { directory: normalizedDirectory } : {}),
                ...(forceRefresh ? { forceRefresh: true } : {}),
                depth: 'availability',
                signal,
            })
        },
    })

    const refresh = useCallback(async () => {
        if (!api) throw new Error('API unavailable')
        forceRefreshRef.current = true
        return await query.refetch()
    }, [api, query.refetch])

    const snapshot = query.data?.snapshot
    return {
        agents: snapshot?.agents.flatMap((agent) => (agent.availability.value ? [agent.availability.value] : [])) ?? [],
        isLoading: query.isLoading,
        isRefreshing: query.isFetching || snapshot?.refreshing === true,
        error: formatOptionalUserFacingErrorMessage(query.error, { t, fallbackKey: 'error.runtime.load' }),
        refetch: refresh,
    }
}
