import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { SaveAgentConfigRequest, SaveAgentConfigResponse } from '@viby/protocol'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { RuntimeAgentConfigResponse } from '@/types/api'

export function useSaveAgentConfig(
    api: ApiClient | null,
    options?: {
        onError?: (error: Error) => void
        onSaved?: (response: SaveAgentConfigResponse) => void
    }
) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (request: SaveAgentConfigRequest) => {
            if (!api) throw new Error('API unavailable')
            return await api.saveAgentConfig(request)
        },
        onSuccess: (response) => {
            queryClient.setQueryData(queryKeys.agentConfig, (current: RuntimeAgentConfigResponse | undefined) => ({
                agents: [
                    ...(current?.agents.filter((agent) => agent.driver !== response.agent.driver) ?? []),
                    response.agent,
                ],
            }))
            options?.onSaved?.(response)
        },
        onError: (error) => options?.onError?.(error instanceof Error ? error : new Error(String(error))),
    })
}
