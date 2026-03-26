import { useCallback, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isPermissionModeAllowedForFlavor, type LiveSessionConfigSupport } from '@viby/protocol'
import type { ApiClient } from '@/api/client'
import type { CodexCollaborationMode, ModelReasoningEffort, PermissionMode, Session, SessionResponse, SessionsResponse } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'
import { removeSessionClientState, writeSessionToQueryCache } from '@/lib/sessionQueryCache'
import { isKnownFlavor } from '@/lib/agentFlavorUtils'

function getRequiredSessionTarget(
    api: ApiClient | null,
    sessionId: string | null
): { api: ApiClient; sessionId: string } {
    if (!api || !sessionId) {
        throw new Error('Session unavailable')
    }

    return { api, sessionId }
}

function createSessionMutationFn<TVariables, TResult>(
    api: ApiClient | null,
    sessionId: string | null,
    run: (api: ApiClient, sessionId: string, variables: TVariables) => Promise<TResult>
): (variables: TVariables) => Promise<TResult> {
    return async (variables: TVariables) => {
        const target = getRequiredSessionTarget(api, sessionId)
        return await run(target.api, target.sessionId, variables)
    }
}

function getMutationPendingState(
    mutations: ReadonlyArray<{ isPending: boolean }>
): boolean {
    return mutations.some((mutation) => mutation.isPending)
}

export function useSessionActions(
    api: ApiClient | null,
    sessionId: string | null,
    agentFlavor?: string | null,
    options?: {
        liveConfigSupport?: LiveSessionConfigSupport
    }
): {
    abortSession: () => Promise<void>
    resumeSession: () => Promise<Session>
    closeSession: () => Promise<void>
    archiveSession: () => Promise<void>
    unarchiveSession: () => Promise<void>
    switchSession: () => Promise<void>
    setPermissionMode: (mode: PermissionMode) => Promise<void>
    setCollaborationMode: (mode: CodexCollaborationMode) => Promise<void>
    setModel: (model: string | null) => Promise<void>
    setModelReasoningEffort: (modelReasoningEffort: ModelReasoningEffort | null) => Promise<void>
    renameSession: (name: string) => Promise<void>
    deleteSession: () => Promise<void>
    isPending: boolean
} {
    const queryClient = useQueryClient()

    const writeSessionSnapshot = useCallback((session: Session): void => {
        writeSessionToQueryCache(queryClient, session)
    }, [queryClient])

    const abortMutation = useMutation({
        mutationFn: createSessionMutationFn(api, sessionId, async (resolvedApi, resolvedSessionId) => {
            return await resolvedApi.abortSession(resolvedSessionId)
        }),
        onMutate: async () => {
            if (!sessionId) {
                return undefined
            }

            const previousSession = queryClient.getQueryData<SessionResponse>(queryKeys.session(sessionId))
            const previousSessions = queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)

            if (previousSession) {
                writeSessionSnapshot({
                    ...previousSession.session,
                    thinking: false,
                    thinkingAt: Date.now()
                })
            }

            return {
                previousSession,
                previousSessions
            }
        },
        onSuccess: writeSessionSnapshot,
        onError: (_error, _variables, context) => {
            if (!sessionId) {
                return
            }
            if (context?.previousSession) {
                queryClient.setQueryData(queryKeys.session(sessionId), context.previousSession)
            }
            if (context?.previousSessions) {
                queryClient.setQueryData(queryKeys.sessions, context.previousSessions)
            }
        },
    })

    const archiveMutation = useMutation({
        mutationFn: createSessionMutationFn(api, sessionId, async (resolvedApi, resolvedSessionId) => {
            return await resolvedApi.archiveSession(resolvedSessionId)
        }),
        onSuccess: writeSessionSnapshot,
    })

    const closeMutation = useMutation({
        mutationFn: createSessionMutationFn(api, sessionId, async (resolvedApi, resolvedSessionId) => {
            return await resolvedApi.closeSession(resolvedSessionId)
        }),
        onSuccess: writeSessionSnapshot,
    })

    const unarchiveMutation = useMutation({
        mutationFn: createSessionMutationFn(api, sessionId, async (resolvedApi, resolvedSessionId) => {
            return await resolvedApi.unarchiveSession(resolvedSessionId)
        }),
        onSuccess: writeSessionSnapshot,
    })

    const resumeMutation = useMutation({
        mutationFn: createSessionMutationFn(api, sessionId, async (resolvedApi, resolvedSessionId) => {
            return await resolvedApi.resumeSession(resolvedSessionId)
        }),
        onSuccess: writeSessionSnapshot,
    })

    const switchMutation = useMutation({
        mutationFn: createSessionMutationFn(api, sessionId, async (resolvedApi, resolvedSessionId) => {
            return await resolvedApi.switchSession(resolvedSessionId)
        }),
        onSuccess: writeSessionSnapshot,
    })

    const permissionMutation = useMutation({
        mutationFn: async (mode: PermissionMode) => {
            const target = getRequiredSessionTarget(api, sessionId)
            if (options?.liveConfigSupport && !options.liveConfigSupport.canChangePermissionMode) {
                throw new Error('Permission mode is only supported for remote-managed active sessions')
            }
            if (isKnownFlavor(agentFlavor) && !isPermissionModeAllowedForFlavor(mode, agentFlavor)) {
                throw new Error('Invalid permission mode for session flavor')
            }
            return await target.api.setPermissionMode(target.sessionId, mode)
        },
        onSuccess: writeSessionSnapshot,
    })

    const collaborationMutation = useMutation({
        mutationFn: async (mode: CodexCollaborationMode) => {
            const target = getRequiredSessionTarget(api, sessionId)
            if (agentFlavor !== 'codex') {
                throw new Error('Collaboration mode is only supported for Codex sessions')
            }
            if (!options?.liveConfigSupport?.canChangeCollaborationMode) {
                throw new Error('Collaboration mode is only supported for remote Codex sessions')
            }
            return await target.api.setCollaborationMode(target.sessionId, mode)
        },
        onSuccess: writeSessionSnapshot,
    })

    const modelMutation = useMutation({
        mutationFn: async (model: string | null) => {
            const target = getRequiredSessionTarget(api, sessionId)
            if (!options?.liveConfigSupport?.canChangeModel) {
                throw new Error('Model selection is only supported for remote Claude, Codex, and Gemini sessions')
            }
            return await target.api.setModel(target.sessionId, model)
        },
        onSuccess: writeSessionSnapshot,
    })

    const modelReasoningEffortMutation = useMutation({
        mutationFn: async (modelReasoningEffort: ModelReasoningEffort | null) => {
            const target = getRequiredSessionTarget(api, sessionId)
            if (agentFlavor !== 'codex' && agentFlavor !== 'claude') {
                throw new Error('Model reasoning effort is only supported for Claude and Codex sessions')
            }
            if (!options?.liveConfigSupport?.canChangeModelReasoningEffort) {
                throw new Error('Model reasoning effort is only supported for remote Claude and Codex sessions')
            }
            return await target.api.setModelReasoningEffort(target.sessionId, modelReasoningEffort)
        },
        onSuccess: writeSessionSnapshot,
    })

    const renameMutation = useMutation({
        mutationFn: createSessionMutationFn(api, sessionId, async (resolvedApi, resolvedSessionId, name: string) => {
            return await resolvedApi.renameSession(resolvedSessionId, name)
        }),
        onSuccess: writeSessionSnapshot,
    })

    const deleteMutation = useMutation({
        mutationFn: createSessionMutationFn(api, sessionId, async (resolvedApi, resolvedSessionId) => {
            await resolvedApi.deleteSession(resolvedSessionId)
        }),
        onSuccess: async () => {
            if (!sessionId) return
            removeSessionClientState(queryClient, sessionId)
        },
    })

    const abortSession = useCallback(async (): Promise<void> => {
        await abortMutation.mutateAsync(undefined)
    }, [abortMutation.mutateAsync])

    const resumeSession = useCallback(async (): Promise<Session> => {
        return await resumeMutation.mutateAsync(undefined)
    }, [resumeMutation.mutateAsync])

    const closeSession = useCallback(async (): Promise<void> => {
        await closeMutation.mutateAsync(undefined)
    }, [closeMutation.mutateAsync])

    const archiveSession = useCallback(async (): Promise<void> => {
        await archiveMutation.mutateAsync(undefined)
    }, [archiveMutation.mutateAsync])

    const unarchiveSession = useCallback(async (): Promise<void> => {
        await unarchiveMutation.mutateAsync(undefined)
    }, [unarchiveMutation.mutateAsync])

    const switchSession = useCallback(async (): Promise<void> => {
        await switchMutation.mutateAsync(undefined)
    }, [switchMutation.mutateAsync])

    const deleteSession = useCallback(async (): Promise<void> => {
        await deleteMutation.mutateAsync(undefined)
    }, [deleteMutation.mutateAsync])

    const setPermissionMode = useCallback(async (mode: PermissionMode): Promise<void> => {
        await permissionMutation.mutateAsync(mode)
    }, [permissionMutation.mutateAsync])

    const setCollaborationMode = useCallback(async (mode: CodexCollaborationMode): Promise<void> => {
        await collaborationMutation.mutateAsync(mode)
    }, [collaborationMutation.mutateAsync])

    const setModel = useCallback(async (model: string | null): Promise<void> => {
        await modelMutation.mutateAsync(model)
    }, [modelMutation.mutateAsync])

    const setModelReasoningEffort = useCallback(async (
        modelReasoningEffort: ModelReasoningEffort | null
    ): Promise<void> => {
        await modelReasoningEffortMutation.mutateAsync(modelReasoningEffort)
    }, [modelReasoningEffortMutation.mutateAsync])

    const renameSession = useCallback(async (name: string): Promise<void> => {
        await renameMutation.mutateAsync(name)
    }, [renameMutation.mutateAsync])

    const isPending = getMutationPendingState([
        abortMutation,
        resumeMutation,
        closeMutation,
        archiveMutation,
        unarchiveMutation,
        switchMutation,
        permissionMutation,
        collaborationMutation,
        modelMutation,
        modelReasoningEffortMutation,
        renameMutation,
        deleteMutation
    ])

    return useMemo(() => ({
        abortSession,
        resumeSession,
        closeSession,
        archiveSession,
        unarchiveSession,
        switchSession,
        setPermissionMode,
        setCollaborationMode,
        setModel,
        setModelReasoningEffort,
        renameSession,
        deleteSession,
        isPending,
    }), [
        abortSession,
        archiveSession,
        closeSession,
        deleteSession,
        isPending,
        renameSession,
        resumeSession,
        setCollaborationMode,
        setModel,
        setModelReasoningEffort,
        setPermissionMode,
        switchSession,
        unarchiveSession
    ])
}
