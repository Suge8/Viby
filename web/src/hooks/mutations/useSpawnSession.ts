import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type {
    CodexCollaborationMode,
    ModelReasoningEffort,
    PermissionMode,
    SpawnResponse
} from '@/types/api'
import { queryKeys } from '@/lib/query-keys'
import { appendRealtimeTrace } from '@/lib/realtimeTrace'

type SpawnInput = {
    machineId: string
    directory: string
    agent?: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
    model?: string
    modelReasoningEffort?: ModelReasoningEffort
    permissionMode?: PermissionMode
    sessionType?: 'simple' | 'worktree'
    worktreeName?: string
    collaborationMode?: CodexCollaborationMode
}

export function useSpawnSession(api: ApiClient | null): {
    spawnSession: (input: SpawnInput) => Promise<SpawnResponse>
    isPending: boolean
    error: string | null
} {
    const queryClient = useQueryClient()

    const mutation = useMutation({
        mutationFn: async (input: SpawnInput) => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.spawnSession(input)
        },
        onSuccess: (result, input) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
            if (result.type === 'success') {
                appendRealtimeTrace({
                    at: Date.now(),
                    type: 'spawn_success',
                    details: {
                        sessionId: result.sessionId,
                        machineId: input.machineId,
                        agent: input.agent ?? 'claude',
                        sessionType: input.sessionType ?? 'simple'
                    }
                })
            }
        },
    })

    return {
        spawnSession: mutation.mutateAsync,
        isPending: mutation.isPending,
        error: mutation.error instanceof Error ? mutation.error.message : mutation.error ? 'Failed to spawn session' : null,
    }
}
