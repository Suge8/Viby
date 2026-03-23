import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
    isPermissionModeAllowedForFlavor,
    type LiveSessionConfigSupport
} from '@viby/protocol'
import type { ApiClient } from '@/api/client'
import type {
    CodexCollaborationMode,
    ModelReasoningEffort,
    PermissionMode,
    Session
} from '@/types/api'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import type { ComposerActionHandlers, ComposerConfigState } from '@/components/AssistantChat/composerTypes'
import { usePlatform } from '@/hooks/usePlatform'
import { isKnownFlavor } from '@/lib/agentFlavorUtils'
import { queryKeys } from '@/lib/query-keys'

type SessionConfigMutationOptions = {
    api: ApiClient
    session: Session
    liveConfigSupport: LiveSessionConfigSupport
    onRefresh: () => void
    onSwitchToRemote: () => Promise<void>
    autocompleteSuggestions?: (query: string) => Promise<Suggestion[]>
    attachmentsSupported: boolean
    allowSendWhenInactive: boolean
}

function assertSessionConfigApi(api: ApiClient | null): ApiClient {
    if (!api) {
        throw new Error('Session unavailable')
    }

    return api
}

function assertSessionConfigCapability(enabled: boolean, message: string): void {
    if (!enabled) {
        throw new Error(message)
    }
}

async function invalidateSessionConfigQueries(
    queryClient: ReturnType<typeof useQueryClient>,
    sessionId: string
): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) })
    await queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
}

export function useSessionLiveConfigControls(options: SessionConfigMutationOptions) {
    const queryClient = useQueryClient()
    const { haptic } = usePlatform()
    const { api, session, liveConfigSupport, onRefresh, onSwitchToRemote, autocompleteSuggestions } = options
    const agentFlavor = session.metadata?.flavor ?? null
    const controlledByUser = session.agentState?.controlledByUser === true
    const sessionId = session.id

    const invalidateSessionConfig = useCallback(async () => {
        await invalidateSessionConfigQueries(queryClient, sessionId)
    }, [queryClient, sessionId])

    const runSessionActionWithRefresh = useCallback(async (action: () => Promise<void>) => {
        try {
            await action()
            await invalidateSessionConfig()
            haptic.notification('success')
            onRefresh()
        } catch (error) {
            haptic.notification('error')
            console.error('Failed to update session chat configuration:', error)
        }
    }, [haptic, invalidateSessionConfig, onRefresh])

    const handlePermissionModeChange = useCallback(async (mode: PermissionMode) => {
        await runSessionActionWithRefresh(async () => {
            const sessionApi = assertSessionConfigApi(api)
            assertSessionConfigCapability(
                liveConfigSupport.canChangePermissionMode,
                'Permission mode is only supported for remote-managed active sessions'
            )
            if (isKnownFlavor(agentFlavor) && !isPermissionModeAllowedForFlavor(mode, agentFlavor)) {
                throw new Error('Invalid permission mode for session flavor')
            }

            await sessionApi.setPermissionMode(sessionId, mode)
        })
    }, [agentFlavor, api, liveConfigSupport.canChangePermissionMode, runSessionActionWithRefresh, sessionId])

    const handleCollaborationModeChange = useCallback(async (mode: CodexCollaborationMode) => {
        await runSessionActionWithRefresh(async () => {
            const sessionApi = assertSessionConfigApi(api)
            if (agentFlavor !== 'codex') {
                throw new Error('Collaboration mode is only supported for Codex sessions')
            }
            assertSessionConfigCapability(
                liveConfigSupport.canChangeCollaborationMode,
                'Collaboration mode is only supported for remote Codex sessions'
            )

            await sessionApi.setCollaborationMode(sessionId, mode)
        })
    }, [agentFlavor, api, liveConfigSupport.canChangeCollaborationMode, runSessionActionWithRefresh, sessionId])

    const handleModelChange = useCallback(async (model: string | null) => {
        await runSessionActionWithRefresh(async () => {
            const sessionApi = assertSessionConfigApi(api)
            assertSessionConfigCapability(
                liveConfigSupport.canChangeModel,
                'Model selection is only supported for remote Codex sessions'
            )

            await sessionApi.setModel(sessionId, model)
        })
    }, [api, liveConfigSupport.canChangeModel, runSessionActionWithRefresh, sessionId])

    const handleModelReasoningEffortChange = useCallback(async (modelReasoningEffort: ModelReasoningEffort | null) => {
        await runSessionActionWithRefresh(async () => {
            const sessionApi = assertSessionConfigApi(api)
            if (agentFlavor !== 'codex' && agentFlavor !== 'claude') {
                throw new Error('Model reasoning effort is only supported for Claude and Codex sessions')
            }
            assertSessionConfigCapability(
                liveConfigSupport.canChangeModelReasoningEffort,
                'Model reasoning effort is only supported for remote Codex sessions'
            )

            await sessionApi.setModelReasoningEffort(sessionId, modelReasoningEffort)
        })
    }, [
        agentFlavor,
        api,
        liveConfigSupport.canChangeModelReasoningEffort,
        runSessionActionWithRefresh,
        sessionId
    ])

    const composerConfig = useMemo<ComposerConfigState>(() => ({
        permissionMode: session.permissionMode,
        collaborationMode: liveConfigSupport.canChangeCollaborationMode ? session.collaborationMode : undefined,
        model: session.model,
        modelReasoningEffort: liveConfigSupport.canChangeModelReasoningEffort ? session.modelReasoningEffort : undefined,
        agentFlavor,
        active: session.active,
        allowSendWhenInactive: options.allowSendWhenInactive,
        controlledByUser,
        attachmentsSupported: options.attachmentsSupported,
    }), [
        agentFlavor,
        controlledByUser,
        liveConfigSupport.canChangeCollaborationMode,
        liveConfigSupport.canChangeModelReasoningEffort,
        options.allowSendWhenInactive,
        options.attachmentsSupported,
        session.active,
        session.collaborationMode,
        session.model,
        session.modelReasoningEffort,
        session.permissionMode
    ])

    const composerHandlers = useMemo<ComposerActionHandlers>(() => ({
        onCollaborationModeChange: liveConfigSupport.canChangeCollaborationMode ? handleCollaborationModeChange : undefined,
        onPermissionModeChange: liveConfigSupport.canChangePermissionMode ? handlePermissionModeChange : undefined,
        onModelChange: liveConfigSupport.canChangeModel ? handleModelChange : undefined,
        onModelReasoningEffortChange: liveConfigSupport.canChangeModelReasoningEffort
            ? handleModelReasoningEffortChange
            : undefined,
        onSwitchToRemote,
        autocompleteSuggestions,
    }), [
        autocompleteSuggestions,
        handleCollaborationModeChange,
        handleModelChange,
        handleModelReasoningEffortChange,
        handlePermissionModeChange,
        liveConfigSupport.canChangeCollaborationMode,
        liveConfigSupport.canChangeModel,
        liveConfigSupport.canChangeModelReasoningEffort,
        liveConfigSupport.canChangePermissionMode,
        onSwitchToRemote
    ])

    return {
        composerConfig,
        composerHandlers
    }
}
