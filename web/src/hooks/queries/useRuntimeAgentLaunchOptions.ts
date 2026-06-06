import { useQuery } from '@tanstack/react-query'
import type { NewSessionAgentLaunchProjection } from '@viby/protocol'
import { useCallback, useRef } from 'react'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'
import { useTranslation } from '@/lib/use-translation'
import { formatOptionalUserFacingErrorMessage } from '@/lib/userFacingError'

const EMPTY_PROJECTION: NewSessionAgentLaunchProjection = { agents: [], unavailable: {} }

export function useRuntimeAgentLaunchOptions(api: ApiClient, directory: string) {
    const { t } = useTranslation()
    const refreshRef = useRef(false)
    const query = useQuery({
        queryKey: queryKeys.agentLaunchOptions(directory),
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        queryFn: async ({ signal }) => {
            const refresh = refreshRef.current
            refreshRef.current = false
            return await api.getAgentLaunchOptions({
                ...(directory ? { directory } : {}),
                ...(refresh ? { refresh } : {}),
                signal,
            })
        },
    })

    const refetch = useCallback(async () => {
        refreshRef.current = true
        return await query.refetch()
    }, [query.refetch])

    return {
        projection: query.data?.projection ?? EMPTY_PROJECTION,
        isLoading: query.isLoading,
        isRefreshing: query.isFetching,
        error: formatOptionalUserFacingErrorMessage(query.error, { t, fallbackKey: 'error.runtime.load' }),
        refetch,
    }
}
