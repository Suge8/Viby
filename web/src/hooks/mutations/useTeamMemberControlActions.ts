import { useCallback } from 'react'
import {
    useMutation,
    useQueryClient,
    type UseMutationResult
} from '@tanstack/react-query'
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

type TeamMemberInterjectInput = {
    text: string
    localId?: string | null
}

type TeamMemberMutationRunner<TInput> = (
    api: ApiClient,
    target: TeamMemberActionTarget,
    input: TInput
) => Promise<Session>

function invalidateTeamQueries(
    queryClient: ReturnType<typeof useQueryClient>,
    target: TeamMemberActionTarget
): Promise<void> {
    return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.teamProject(target.projectId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.teamProjectHistory(target.projectId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.messages(target.sessionId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.session(target.sessionId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.messages(target.managerSessionId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.session(target.managerSessionId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
    ]).then(() => undefined)
}

function requireTeamMemberActionDeps(
    api: ApiClient | null,
    target: TeamMemberActionTarget | null
): {
    api: ApiClient
    target: TeamMemberActionTarget
} {
    if (!api || !target) {
        throw new Error('Team member unavailable')
    }

    return { api, target }
}

function useTeamMemberMutation<TInput>(
    api: ApiClient | null,
    target: TeamMemberActionTarget | null,
    onSuccess: (session: Session) => Promise<void>,
    run: TeamMemberMutationRunner<TInput>
): UseMutationResult<Session, Error, TInput> {
    return useMutation({
        mutationFn: async (input: TInput) => {
            const deps = requireTeamMemberActionDeps(api, target)
            return await run(deps.api, deps.target, input)
        },
        onSuccess
    })
}

export function useTeamMemberControlActions(
    api: ApiClient | null,
    target: TeamMemberActionTarget | null
): {
    interject: (input: TeamMemberInterjectInput) => Promise<Session>
    takeOver: () => Promise<Session>
    returnToManager: () => Promise<Session>
    isPending: boolean
    error: string | null
} {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const handleSuccess = useCallback(async (session: Session) => {
        if (!target) {
            return
        }

        writeSessionToQueryCache(queryClient, session)
        await invalidateTeamQueries(queryClient, target)
    }, [queryClient, target])

    const interjectMutation = useTeamMemberMutation(
        api,
        target,
        handleSuccess,
        async (client, resolvedTarget, input: TeamMemberInterjectInput) => {
            return await client.interjectTeamMember(resolvedTarget.memberId, input)
        }
    )
    const takeOverMutation = useTeamMemberMutation(
        api,
        target,
        handleSuccess,
        async (client, resolvedTarget, _input: void) => {
            return await client.takeOverTeamMember(resolvedTarget.memberId)
        }
    )
    const returnMutation = useTeamMemberMutation(
        api,
        target,
        handleSuccess,
        async (client, resolvedTarget, _input: void) => {
            return await client.returnTeamMember(resolvedTarget.memberId)
        }
    )
    const interjectMutateAsync = interjectMutation.mutateAsync
    const takeOverMutateAsync = takeOverMutation.mutateAsync
    const returnMutateAsync = returnMutation.mutateAsync

    const interject = useCallback(async (input: TeamMemberInterjectInput) => {
        return await interjectMutateAsync(input)
    }, [interjectMutateAsync])

    const takeOver = useCallback(async () => {
        return await takeOverMutateAsync(undefined)
    }, [takeOverMutateAsync])

    const returnToManager = useCallback(async () => {
        return await returnMutateAsync(undefined)
    }, [returnMutateAsync])

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
