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
import { writeSessionToQueryCache } from '@/lib/sessionQueryCache'

type SessionConfigMutationOptions = {
    api: ApiClient
    session: Session
    liveConfigSupport: LiveSessionConfigSupport
    onSwitchToRemote: () => Promise<void>
    autocompleteSuggestions?: (query: string) => Promise<Suggestion[]>
    attachmentsSupported: boolean
    allowSendWhenInactive: boolean
    isResumingSession: boolean
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

export function useSessionLiveConfigControls(options: SessionConfigMutationOptions) {
    const queryClient = useQueryClient()
    const { haptic } = usePlatform()
    const { api, session, liveConfigSupport, onSwitchToRemote, autocompleteSuggestions } = options
    const agentFlavor = session.metadata?.flavor ?? null
    const controlledByUser = session.agentState?.controlledByUser === true
    const sessionId = session.id

    const runSessionConfigAction = useCallback(async (action: () => Promise<Session>) => {
        try {
            const updatedSession = await action()
            writeSessionToQueryCache(queryClient, updatedSession)
            haptic.notification('success')
        } catch (error) {
            haptic.notification('error')
            console.error('Failed to update session chat configuration:', error)
        }
    }, [haptic, queryClient])

    const handlePermissionModeChange = useCallback(async (mode: PermissionMode) => {
        await runSessionConfigAction(async () => {
            const sessionApi = assertSessionConfigApi(api)
            assertSessionConfigCapability(
                liveConfigSupport.canChangePermissionMode,
                'Permission mode is only supported for remote-managed active sessions'
            )
            if (isKnownFlavor(agentFlavor) && !isPermissionModeAllowedForFlavor(mode, agentFlavor)) {
                throw new Error('Invalid permission mode for session flavor')
            }

            return await sessionApi.setPermissionMode(sessionId, mode)
        })
    }, [agentFlavor, api, liveConfigSupport.canChangePermissionMode, runSessionConfigAction, sessionId])

    const handleCollaborationModeChange = useCallback(async (mode: CodexCollaborationMode) => {
        await runSessionConfigAction(async () => {
            const sessionApi = assertSessionConfigApi(api)
            if (agentFlavor !== 'codex') {
                throw new Error('Collaboration mode is only supported for Codex sessions')
            }
            assertSessionConfigCapability(
                liveConfigSupport.canChangeCollaborationMode,
                'Collaboration mode is only supported for remote Codex sessions'
            )

            return await sessionApi.setCollaborationMode(sessionId, mode)
        })
    }, [agentFlavor, api, liveConfigSupport.canChangeCollaborationMode, runSessionConfigAction, sessionId])

    const handleModelChange = useCallback(async (model: string | null) => {
        await runSessionConfigAction(async () => {
            const sessionApi = assertSessionConfigApi(api)
            assertSessionConfigCapability(
                liveConfigSupport.canChangeModel,
                'Model selection is only supported for remote Claude and Codex sessions'
            )

            return await sessionApi.setModel(sessionId, model)
        })
    }, [api, liveConfigSupport.canChangeModel, runSessionConfigAction, sessionId])

    const handleModelReasoningEffortChange = useCallback(async (modelReasoningEffort: ModelReasoningEffort | null) => {
        await runSessionConfigAction(async () => {
            const sessionApi = assertSessionConfigApi(api)
            if (agentFlavor !== 'codex' && agentFlavor !== 'claude') {
                throw new Error('Model reasoning effort is only supported for Claude and Codex sessions')
            }
            assertSessionConfigCapability(
                liveConfigSupport.canChangeModelReasoningEffort,
                'Model reasoning effort is only supported for remote Claude and Codex sessions'
            )

            return await sessionApi.setModelReasoningEffort(sessionId, modelReasoningEffort)
        })
    }, [
        agentFlavor,
        api,
        liveConfigSupport.canChangeModelReasoningEffort,
        runSessionConfigAction,
        sessionId
    ])

    const composerConfig = useMemo<ComposerConfigState>(() => ({
        permissionMode: session.permissionMode,
        collaborationMode: liveConfigSupport.canChangeCollaborationMode ? session.collaborationMode : undefined,
        model: session.model,
        modelReasoningEffort: liveConfigSupport.canChangeModelReasoningEffort ? session.modelReasoningEffort : undefined,
        isResuming: options.isResumingSession,
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
        options.isResumingSession,
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
