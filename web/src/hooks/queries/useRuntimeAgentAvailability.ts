import { useQuery } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'
import { useTranslation } from '@/lib/use-translation'
import { formatOptionalUserFacingErrorMessage } from '@/lib/userFacingError'
import type { AgentAvailability } from '@/types/api'

const AGENT_AVAILABILITY_STALE_TIME_MS = 15_000

export function useRuntimeAgentAvailability(
    api: ApiClient | null,
    directory?: string | null
): {
    agents: readonly AgentAvailability[]
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const { t } = useTranslation()
    const normalizedDirectory = directory?.trim() ?? ''
    const forceRefreshRef = useRef(false)
    const queryFn = useCallback(
        async ({ signal }: { signal: AbortSignal }) => {
            if (!api) {
                throw new Error('API unavailable')
            }

            const shouldForceRefresh = forceRefreshRef.current
            forceRefreshRef.current = false

            return await api.getRuntimeAgentAvailability({
                ...(normalizedDirectory ? { directory: normalizedDirectory } : {}),
                ...(shouldForceRefresh ? { forceRefresh: true } : {}),
                signal,
            })
        },
        [api, normalizedDirectory]
    )
    const query = useQuery({
        queryKey: queryKeys.runtimeAgentAvailability(normalizedDirectory),
        queryFn,
        enabled: Boolean(api),
        staleTime: AGENT_AVAILABILITY_STALE_TIME_MS,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchOnMount: true,
    })

    const refresh = useCallback(async () => {
        if (!api) {
            throw new Error('API unavailable')
        }

        forceRefreshRef.current = true
        return await query.refetch()
    }, [api, query])

    return {
        agents: query.data?.agents ?? [],
        isLoading: query.isLoading,
        error: formatOptionalUserFacingErrorMessage(query.error, {
            t,
            fallbackKey: 'error.runtime.load',
        }),
        refetch: refresh,
    }
}
