import { useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { Session } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'
import { writeSessionToQueryCache } from '@/lib/sessionQueryCache'
import { formatOptionalUserFacingErrorMessage } from '@/lib/userFacingError'
import { useTranslation } from '@/lib/use-translation'

type TeamMemberActionTarget = {
    memberId: string
    projectId: string
    sessionId: string
    managerSessionId: string
}

function invalidateTeamQueries(
    queryClient: ReturnType<typeof useQueryClient>,
    target: TeamMemberActionTarget
): Promise<unknown[]> {
    return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.teamProject(target.projectId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.messages(target.sessionId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.session(target.sessionId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.messages(target.managerSessionId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.session(target.managerSessionId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
    ])
}

export function useTeamMemberControlActions(
    api: ApiClient | null,
    target: TeamMemberActionTarget | null
): {
    interject: (input: { text: string; localId?: string | null }) => Promise<Session>
    takeOver: () => Promise<Session>
    returnToManager: () => Promise<Session>
    isPending: boolean
    error: string | null
} {
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    const interjectMutation = useMutation({
        mutationFn: async (input: { text: string; localId?: string | null }) => {
            if (!api || !target) {
                throw new Error('Team member unavailable')
            }
            return await api.interjectTeamMember(target.memberId, input)
        },
        onSuccess: async (session) => {
            if (!target) {
                return
            }
            writeSessionToQueryCache(queryClient, session)
            await invalidateTeamQueries(queryClient, target)
        }
    })

    const takeOverMutation = useMutation({
        mutationFn: async () => {
            if (!api || !target) {
                throw new Error('Team member unavailable')
            }
            return await api.takeOverTeamMember(target.memberId)
        },
        onSuccess: async (session) => {
            if (!target) {
                return
            }
            writeSessionToQueryCache(queryClient, session)
            await invalidateTeamQueries(queryClient, target)
        }
    })

    const returnMutation = useMutation({
        mutationFn: async () => {
            if (!api || !target) {
                throw new Error('Team member unavailable')
            }
            return await api.returnTeamMember(target.memberId)
        },
        onSuccess: async (session) => {
            if (!target) {
                return
            }
            writeSessionToQueryCache(queryClient, session)
            await invalidateTeamQueries(queryClient, target)
        }
    })

    const interject = useCallback(async (input: { text: string; localId?: string | null }) => {
        return await interjectMutation.mutateAsync(input)
    }, [interjectMutation.mutateAsync])

    const takeOver = useCallback(async () => {
        return await takeOverMutation.mutateAsync()
    }, [takeOverMutation.mutateAsync])

    const returnToManager = useCallback(async () => {
        return await returnMutation.mutateAsync()
    }, [returnMutation.mutateAsync])

    const mutationError = interjectMutation.error
        ?? takeOverMutation.error
        ?? returnMutation.error

    return {
        interject,
        takeOver,
        returnToManager,
        isPending: interjectMutation.isPending || takeOverMutation.isPending || returnMutation.isPending,
        error: formatOptionalUserFacingErrorMessage(mutationError, {
            t,
            fallbackKey: 'error.session.load'
        })
    }
}
