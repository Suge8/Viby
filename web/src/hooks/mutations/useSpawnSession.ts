import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type {
    AgentFlavor,
    CodexCollaborationMode,
    ModelReasoningEffort,
    PermissionMode,
    Session,
    SpawnResponse,
    TeamSessionSpawnRole
} from '@/types/api'
import { appendRealtimeTrace } from '@/lib/realtimeTrace'
import { writeSessionToQueryCache } from '@/lib/sessionQueryCache'
import { formatOptionalUserFacingErrorMessage } from '@/lib/userFacingError'
import { useTranslation } from '@/lib/use-translation'

type SpawnInput = {
    machineId: string
    directory: string
    agent?: AgentFlavor
    model?: string
    modelReasoningEffort?: ModelReasoningEffort
    permissionMode?: PermissionMode
    sessionRole?: TeamSessionSpawnRole
    sessionType?: 'simple' | 'worktree'
    worktreeName?: string
    collaborationMode?: CodexCollaborationMode
}

export function useSpawnSession(api: ApiClient | null): {
    spawnSession: (input: SpawnInput) => Promise<SpawnResponse>
    isPending: boolean
    error: string | null
} {
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    function writeSessionSnapshot(session: Session): void {
        writeSessionToQueryCache(queryClient, session)
    }

    const mutation = useMutation({
        mutationFn: async (input: SpawnInput) => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.spawnSession(input)
        },
        onSuccess: (result, input) => {
            if (result.type === 'success') {
                writeSessionSnapshot(result.session)
                appendRealtimeTrace({
                    at: Date.now(),
                    type: 'spawn_success',
                    details: {
                        sessionId: result.session.id,
                        machineId: input.machineId,
                        agent: input.agent ?? 'claude',
                        sessionRole: input.sessionRole ?? 'normal',
                        sessionType: input.sessionType ?? 'simple'
                    }
                })
            }
        },
    })

    return {
        spawnSession: mutation.mutateAsync,
        isPending: mutation.isPending,
        error: formatOptionalUserFacingErrorMessage(mutation.error, {
            t,
            fallbackKey: 'error.session.create'
        }),
    }
}
