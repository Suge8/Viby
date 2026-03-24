import { useCallback, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isPermissionModeAllowedForFlavor, type LiveSessionConfigSupport } from '@viby/protocol'
import type { ApiClient } from '@/api/client'
import type { CodexCollaborationMode, ModelReasoningEffort, PermissionMode, Session } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'
import { removeSessionClientState, writeSessionToQueryCache } from '@/lib/sessionQueryCache'
import { isKnownFlavor } from '@/lib/agentFlavorUtils'

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

    const invalidateSession = useCallback(async () => {
        if (!sessionId) return
        await queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) })
        await queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
    }, [queryClient, sessionId])

    const writeSessionSnapshot = useCallback((session: Session): void => {
        writeSessionToQueryCache(queryClient, session)
    }, [queryClient])

    const abortMutation = useMutation({
        mutationFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            await api.abortSession(sessionId)
        },
        onSuccess: () => void invalidateSession(),
    })

    const archiveMutation = useMutation({
        mutationFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            return await api.archiveSession(sessionId)
        },
        onSuccess: writeSessionSnapshot,
    })

    const closeMutation = useMutation({
        mutationFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            return await api.closeSession(sessionId)
        },
        onSuccess: writeSessionSnapshot,
    })

    const unarchiveMutation = useMutation({
        mutationFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            return await api.unarchiveSession(sessionId)
        },
        onSuccess: writeSessionSnapshot,
    })

    const resumeMutation = useMutation({
        mutationFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            return await api.resumeSession(sessionId)
        },
        onSuccess: writeSessionSnapshot,
    })

    const switchMutation = useMutation({
        mutationFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            await api.switchSession(sessionId)
        },
        onSuccess: () => void invalidateSession(),
    })

    const permissionMutation = useMutation({
        mutationFn: async (mode: PermissionMode) => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            if (options?.liveConfigSupport && !options.liveConfigSupport.canChangePermissionMode) {
                throw new Error('Permission mode is only supported for remote-managed active sessions')
            }
            if (isKnownFlavor(agentFlavor) && !isPermissionModeAllowedForFlavor(mode, agentFlavor)) {
                throw new Error('Invalid permission mode for session flavor')
            }
            return await api.setPermissionMode(sessionId, mode)
        },
        onSuccess: writeSessionSnapshot,
    })

    const collaborationMutation = useMutation({
        mutationFn: async (mode: CodexCollaborationMode) => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            if (agentFlavor !== 'codex') {
                throw new Error('Collaboration mode is only supported for Codex sessions')
            }
            if (!options?.liveConfigSupport?.canChangeCollaborationMode) {
                throw new Error('Collaboration mode is only supported for remote Codex sessions')
            }
            return await api.setCollaborationMode(sessionId, mode)
        },
        onSuccess: writeSessionSnapshot,
    })

    const modelMutation = useMutation({
        mutationFn: async (model: string | null) => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            if (!options?.liveConfigSupport?.canChangeModel) {
                throw new Error('Model selection is only supported for remote Claude and Codex sessions')
            }
            return await api.setModel(sessionId, model)
        },
        onSuccess: writeSessionSnapshot,
    })

    const modelReasoningEffortMutation = useMutation({
        mutationFn: async (modelReasoningEffort: ModelReasoningEffort | null) => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            if (agentFlavor !== 'codex' && agentFlavor !== 'claude') {
                throw new Error('Model reasoning effort is only supported for Claude and Codex sessions')
            }
            if (!options?.liveConfigSupport?.canChangeModelReasoningEffort) {
                throw new Error('Model reasoning effort is only supported for remote Claude and Codex sessions')
            }
            return await api.setModelReasoningEffort(sessionId, modelReasoningEffort)
        },
        onSuccess: writeSessionSnapshot,
    })

    const renameMutation = useMutation({
        mutationFn: async (name: string) => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            return await api.renameSession(sessionId, name)
        },
        onSuccess: writeSessionSnapshot,
    })

    const deleteMutation = useMutation({
        mutationFn: async () => {
            if (!api || !sessionId) {
                throw new Error('Session unavailable')
            }
            await api.deleteSession(sessionId)
        },
        onSuccess: async () => {
            if (!sessionId) return
            removeSessionClientState(queryClient, sessionId)
        },
    })

    const closeSession = useCallback(async (): Promise<void> => {
        await closeMutation.mutateAsync()
    }, [closeMutation])

    const archiveSession = useCallback(async (): Promise<void> => {
        await archiveMutation.mutateAsync()
    }, [archiveMutation])

    const unarchiveSession = useCallback(async (): Promise<void> => {
        await unarchiveMutation.mutateAsync()
    }, [unarchiveMutation])

    return useMemo(() => ({
        abortSession: abortMutation.mutateAsync,
        resumeSession: resumeMutation.mutateAsync,
        closeSession,
        archiveSession,
        unarchiveSession,
        switchSession: switchMutation.mutateAsync,
        setPermissionMode: async (mode: PermissionMode) => {
            await permissionMutation.mutateAsync(mode)
        },
        setCollaborationMode: async (mode: CodexCollaborationMode) => {
            await collaborationMutation.mutateAsync(mode)
        },
        setModel: async (model: string | null) => {
            await modelMutation.mutateAsync(model)
        },
        setModelReasoningEffort: async (modelReasoningEffort: ModelReasoningEffort | null) => {
            await modelReasoningEffortMutation.mutateAsync(modelReasoningEffort)
        },
        renameSession: async (name: string) => {
            await renameMutation.mutateAsync(name)
        },
        deleteSession: deleteMutation.mutateAsync,
        isPending: abortMutation.isPending
            || resumeMutation.isPending
            || closeMutation.isPending
            || archiveMutation.isPending
            || unarchiveMutation.isPending
            || switchMutation.isPending
            || permissionMutation.isPending
            || collaborationMutation.isPending
            || modelMutation.isPending
            || modelReasoningEffortMutation.isPending
            || renameMutation.isPending
            || deleteMutation.isPending,
    }), [
        abortMutation.mutateAsync,
        archiveMutation.isPending,
        archiveSession,
        closeMutation.isPending,
        closeSession,
        collaborationMutation.isPending,
        collaborationMutation.mutateAsync,
        deleteMutation.isPending,
        deleteMutation.mutateAsync,
        modelMutation.isPending,
        modelMutation.mutateAsync,
        modelReasoningEffortMutation.isPending,
        modelReasoningEffortMutation.mutateAsync,
        permissionMutation.isPending,
        permissionMutation.mutateAsync,
        renameMutation.isPending,
        renameMutation.mutateAsync,
        resumeMutation.isPending,
        resumeMutation.mutateAsync,
        switchMutation.isPending,
        switchMutation.mutateAsync,
        unarchiveMutation.isPending,
        unarchiveSession,
        abortMutation.isPending
    ])
}
