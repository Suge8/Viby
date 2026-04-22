import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
    assertSameSessionSwitchTargetDriver,
    isPermissionModeAllowedForDriver,
    type LiveSessionConfigSupport,
    resolveSessionDriver,
    type SameSessionSwitchTargetDriver,
    type SessionDriver,
    supportsLiveModelReasoningEffortForDriver,
} from '@viby/protocol'
import { useCallback } from 'react'
import type { ApiClient } from '@/api/client'
import { setSessionReplyingState } from '@/lib/message-window-store'
import { removeSessionClientState, writeSessionToQueryCache } from '@/lib/sessionQueryCache'
import type { CodexCollaborationMode, ModelReasoningEffort, PermissionMode, Session, SessionSummary } from '@/types/api'
import {
    type AbortSessionMutationContext,
    captureAbortSessionMutationContext,
    restoreAbortSessionMutationContext,
} from './sessionAbortSupport'
import { createSessionMutationFn, getMutationPendingState, getRequiredSessionTarget } from './sessionMutationSupport'

type SessionActionSource = Pick<Session, 'id' | 'metadata'> | Pick<SessionSummary, 'id' | 'metadata'>

export function useSessionActions(
    api: ApiClient | null,
    session: SessionActionSource | null | undefined,
    options?: {
        liveConfigSupport?: LiveSessionConfigSupport
    }
): {
    abortSession: () => Promise<void>
    stopSession: () => Promise<void>
    switchSessionDriver: (targetDriver: SessionDriver | null | undefined) => Promise<void>
    setPermissionMode: (mode: PermissionMode) => Promise<void>
    setCollaborationMode: (mode: CodexCollaborationMode) => Promise<void>
    setModel: (model: string | null) => Promise<void>
    setModelReasoningEffort: (modelReasoningEffort: ModelReasoningEffort | null) => Promise<void>
    renameSession: (name: string) => Promise<void>
    deleteSession: () => Promise<void>
    isPending: boolean
    isSwitchingSessionDriver: boolean
} {
    const queryClient = useQueryClient()
    const sessionId = session?.id ?? null
    const sessionDriver = resolveSessionDriver(session?.metadata)
    const writeSessionSnapshot = useCallback(
        (nextSession: Session): void => {
            writeSessionToQueryCache(queryClient, nextSession)
        },
        [queryClient]
    )

    const abortMutation = useMutation<Session, Error, void, AbortSessionMutationContext | undefined>({
        mutationFn: createSessionMutationFn(api, sessionId, async (resolvedApi, resolvedSessionId) => {
            return await resolvedApi.abortSession(resolvedSessionId)
        }),
        onMutate: async () => {
            if (!sessionId) {
                return undefined
            }

            return captureAbortSessionMutationContext({
                queryClient,
                sessionId,
            })
        },
        onSuccess: (nextSession) => {
            writeSessionSnapshot(nextSession)
            setSessionReplyingState(nextSession.id, null)
        },
        onError: (_error, _variables, context) => {
            if (!sessionId) {
                return
            }

            restoreAbortSessionMutationContext({
                queryClient,
                sessionId,
                context,
            })
        },
    })

    const stopMutation = useMutation({
        mutationFn: createSessionMutationFn(api, sessionId, async (resolvedApi, resolvedSessionId) => {
            return await resolvedApi.closeSession(resolvedSessionId)
        }),
        onSuccess: writeSessionSnapshot,
    })

    const switchMutation = useMutation({
        mutationFn: createSessionMutationFn(
            api,
            sessionId,
            async (resolvedApi, resolvedSessionId, targetDriver: SameSessionSwitchTargetDriver) => {
                return await resolvedApi.switchSessionDriver(resolvedSessionId, targetDriver)
            }
        ),
        onSuccess: writeSessionSnapshot,
    })

    const permissionMutation = useMutation({
        mutationFn: async (mode: PermissionMode) => {
            const target = getRequiredSessionTarget(api, sessionId)
            if (options?.liveConfigSupport && !options.liveConfigSupport.canChangePermissionMode) {
                throw new Error('Permission mode is only supported for Viby-managed active sessions')
            }
            if (sessionDriver && !isPermissionModeAllowedForDriver(mode, sessionDriver)) {
                throw new Error('Invalid permission mode for session driver')
            }
            return await target.api.setPermissionMode(target.sessionId, mode)
        },
        onSuccess: writeSessionSnapshot,
    })

    const collaborationMutation = useMutation({
        mutationFn: async (mode: CodexCollaborationMode) => {
            const target = getRequiredSessionTarget(api, sessionId)
            if (sessionDriver !== 'codex') {
                throw new Error('Collaboration mode is only supported for Codex sessions')
            }
            if (!options?.liveConfigSupport?.canChangeCollaborationMode) {
                throw new Error('Collaboration mode is only supported for Viby-managed Codex sessions')
            }
            return await target.api.setCollaborationMode(target.sessionId, mode)
        },
        onSuccess: writeSessionSnapshot,
    })

    const modelMutation = useMutation({
        mutationFn: async (model: string | null) => {
            const target = getRequiredSessionTarget(api, sessionId)
            if (!options?.liveConfigSupport?.canChangeModel) {
                throw new Error(
                    'Model selection is only supported for Viby-managed Claude, Codex, Gemini, and Pi sessions'
                )
            }
            return await target.api.setModel(target.sessionId, model)
        },
        onSuccess: writeSessionSnapshot,
    })

    const modelReasoningEffortMutation = useMutation({
        mutationFn: async (modelReasoningEffort: ModelReasoningEffort | null) => {
            const target = getRequiredSessionTarget(api, sessionId)
            if (!supportsLiveModelReasoningEffortForDriver(sessionDriver)) {
                throw new Error('Model reasoning effort is not supported for this session driver')
            }
            if (!options?.liveConfigSupport?.canChangeModelReasoningEffort) {
                throw new Error(
                    'Model reasoning effort is only supported for Viby-managed sessions with reasoning controls'
                )
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
            if (!sessionId) {
                return
            }
            removeSessionClientState(queryClient, sessionId)
        },
    })

    const abortSession = useCallback(async (): Promise<void> => {
        await abortMutation.mutateAsync(undefined)
    }, [abortMutation.mutateAsync])

    const stopSession = useCallback(async (): Promise<void> => {
        await stopMutation.mutateAsync(undefined)
    }, [stopMutation.mutateAsync])

    const switchSessionDriver = useCallback(
        async (targetDriver: SessionDriver | null | undefined): Promise<void> => {
            await switchMutation.mutateAsync(assertSameSessionSwitchTargetDriver(targetDriver))
        },
        [switchMutation.mutateAsync]
    )

    const deleteSession = useCallback(async (): Promise<void> => {
        await deleteMutation.mutateAsync(undefined)
    }, [deleteMutation.mutateAsync])

    const setPermissionMode = useCallback(
        async (mode: PermissionMode): Promise<void> => {
            await permissionMutation.mutateAsync(mode)
        },
        [permissionMutation.mutateAsync]
    )

    const setCollaborationMode = useCallback(
        async (mode: CodexCollaborationMode): Promise<void> => {
            await collaborationMutation.mutateAsync(mode)
        },
        [collaborationMutation.mutateAsync]
    )

    const setModel = useCallback(
        async (model: string | null): Promise<void> => {
            await modelMutation.mutateAsync(model)
        },
        [modelMutation.mutateAsync]
    )

    const setModelReasoningEffort = useCallback(
        async (modelReasoningEffort: ModelReasoningEffort | null): Promise<void> => {
            await modelReasoningEffortMutation.mutateAsync(modelReasoningEffort)
        },
        [modelReasoningEffortMutation.mutateAsync]
    )

    const renameSession = useCallback(
        async (name: string): Promise<void> => {
            await renameMutation.mutateAsync(name)
        },
        [renameMutation.mutateAsync]
    )

    const isPending = getMutationPendingState([
        abortMutation,
        stopMutation,
        switchMutation,
        permissionMutation,
        collaborationMutation,
        modelMutation,
        modelReasoningEffortMutation,
        renameMutation,
        deleteMutation,
    ])

    return {
        abortSession,
        stopSession,
        switchSessionDriver,
        setPermissionMode,
        setCollaborationMode,
        setModel,
        setModelReasoningEffort,
        renameSession,
        deleteSession,
        isPending,
        isSwitchingSessionDriver: switchMutation.isPending,
    }
}
