import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { RestoreAgentConfigRequest, RestoreAgentConfigResponse } from '@viby/protocol'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { RuntimeAgentConfigResponse } from '@/types/api'

export function useRestoreAgentConfig(
    api: ApiClient | null,
    options?: {
        onError?: (error: Error) => void
        onRestored?: (response: RestoreAgentConfigResponse) => void
    }
) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (request: RestoreAgentConfigRequest) => {
            if (!api) throw new Error('API unavailable')
            return await api.restoreAgentConfig(request)
        },
        onSuccess: (response) => {
            queryClient.setQueryData(queryKeys.agentConfig, (current: RuntimeAgentConfigResponse | undefined) => ({
                agents: [
                    ...(current?.agents.filter((agent) => agent.driver !== response.agent.driver) ?? []),
                    response.agent,
                ],
            }))
            options?.onRestored?.(response)
        },
        onError: (error) => options?.onError?.(error instanceof Error ? error : new Error(String(error))),
    })
}
