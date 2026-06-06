import { useQueryClient } from '@tanstack/react-query'
import {
    type AgentAvailability,
    getAvailableSameSessionSwitchTargetDrivers,
    isPermissionModeAllowedForDriver,
    type LiveSessionConfigSupport,
    resolveSessionDriver,
    type SameSessionSwitchTargetDriver,
    supportsLiveModelReasoningEffortForDriver,
} from '@viby/protocol'
import { useCallback, useMemo } from 'react'
import type { ApiClient } from '@/api/client'
import type { ComposerActionHandlers, ComposerConfigState } from '@/components/AssistantChat/composerTypes'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import { usePlatform } from '@/hooks/usePlatform'
import { useNoticeCenter } from '@/lib/notice-center'
import { reportWebRuntimeError } from '@/lib/runtimeDiagnostics'
import { writeSessionToQueryCache } from '@/lib/sessionQueryCache'
import { useTranslation } from '@/lib/use-translation'
import type {
    CodexCollaborationMode,
    CodexServiceTier,
    ModelReasoningEffort,
    PermissionMode,
    PiModelCapability,
    Session,
} from '@/types/api'
import {
    assertSessionConfigApi,
    assertSessionConfigCapability,
    formatSwitchDriverErrorMessage,
    resolveActivePiCapability,
} from './sessionLiveConfigControlSupport'

type SessionConfigMutationOptions = {
    api: ApiClient
    session: Session
    liveConfigSupport: LiveSessionConfigSupport
    onSwitchSessionDriver: (targetDriver: SameSessionSwitchTargetDriver) => Promise<void>
    isSwitchingSessionDriver: boolean
    agentAvailability?: readonly AgentAvailability[] | null
    autocompleteSuggestions?: (query: string) => Promise<Suggestion[]>
    autocompleteRefreshKey?: number
    onSuggestionAction?: (suggestion: Suggestion) => void
    attachmentsSupported: boolean
    allowSendWhenInactive: boolean
}

export function useSessionLiveConfigControls(options: SessionConfigMutationOptions) {
    const queryClient = useQueryClient()
    const { haptic } = usePlatform()
    const { addToast } = useNoticeCenter()
    const { t } = useTranslation()
    const {
        api,
        session,
        liveConfigSupport,
        onSwitchSessionDriver,
        isSwitchingSessionDriver,
        agentAvailability,
        autocompleteSuggestions,
        autocompleteRefreshKey,
        onSuggestionAction,
    } = options
    const sessionDriver = resolveSessionDriver(session.metadata)
    const switchTargetDrivers =
        session.active && sessionDriver && agentAvailability
            ? getAvailableSameSessionSwitchTargetDrivers(sessionDriver, agentAvailability)
            : []
    const controlledByUser = session.agentState?.controlledByUser === true
    const sessionId = session.id
    const canChangePermissionMode =
        liveConfigSupport.canChangePermissionMode || (!session.active && options.allowSendWhenInactive)
    const piModelCapabilities = sessionDriver === 'pi' ? (session.metadata?.piModelScope?.models ?? []) : []
    const activePiCapability = resolveActivePiCapability(session.model, piModelCapabilities)

    const runSessionConfigAction = useCallback(
        async (action: () => Promise<Session>) => {
            try {
                const updatedSession = await action()
                writeSessionToQueryCache(queryClient, updatedSession)
                haptic.notification('success')
            } catch (error) {
                haptic.notification('error')
                reportWebRuntimeError('Failed to update session chat configuration.', error)
            }
        },
        [haptic, queryClient]
    )

    const handleSwitchSessionDriver = useCallback(
        async (targetDriver: SameSessionSwitchTargetDriver) => {
            if (!switchTargetDrivers.includes(targetDriver) || isSwitchingSessionDriver) {
                return
            }

            try {
                await onSwitchSessionDriver(targetDriver)
                haptic.notification('success')
            } catch (error) {
                const description = formatSwitchDriverErrorMessage(error, t)
                reportWebRuntimeError('Failed to switch session driver from composer controls.', error)
                addToast({
                    title: t('chat.switchDriver.failed.title'),
                    description,
                    tone: 'danger',
                })
                haptic.notification('error')
            }
        },
        [addToast, haptic, isSwitchingSessionDriver, onSwitchSessionDriver, switchTargetDrivers, t]
    )

    const handlePermissionModeChange = useCallback(
        async (mode: PermissionMode) => {
            await runSessionConfigAction(async () => {
                const sessionApi = assertSessionConfigApi(api)
                assertSessionConfigCapability(
                    canChangePermissionMode,
                    'Permission mode is only supported for Viby-managed sessions'
                )
                if (sessionDriver && !isPermissionModeAllowedForDriver(mode, sessionDriver)) {
                    throw new Error('Invalid permission mode for session driver')
                }

                return await sessionApi.setPermissionMode(sessionId, mode)
            })
        },
        [api, canChangePermissionMode, runSessionConfigAction, sessionDriver, sessionId]
    )

    const handleCollaborationModeChange = useCallback(
        async (mode: CodexCollaborationMode) => {
            await runSessionConfigAction(async () => {
                const sessionApi = assertSessionConfigApi(api)
                if (sessionDriver !== 'codex') {
                    throw new Error('Collaboration mode is only supported for Codex sessions')
                }
                assertSessionConfigCapability(
                    liveConfigSupport.canChangeCollaborationMode,
                    'Collaboration mode is only supported for Viby-managed Codex sessions'
                )

                return await sessionApi.setCollaborationMode(sessionId, mode)
            })
        },
        [api, liveConfigSupport.canChangeCollaborationMode, runSessionConfigAction, sessionDriver, sessionId]
    )

    const handleModelChange = useCallback(
        async (model: string | null) => {
            await runSessionConfigAction(async () => {
                const sessionApi = assertSessionConfigApi(api)
                assertSessionConfigCapability(
                    liveConfigSupport.canChangeModel,
                    'Model selection is only supported for remote Claude, Codex, Gemini, and Pi sessions'
                )

                return await sessionApi.setModel(sessionId, model)
            })
        },
        [api, liveConfigSupport.canChangeModel, runSessionConfigAction, sessionId]
    )

    const handleModelReasoningEffortChange = useCallback(
        async (modelReasoningEffort: ModelReasoningEffort | null) => {
            await runSessionConfigAction(async () => {
                const sessionApi = assertSessionConfigApi(api)
                if (!supportsLiveModelReasoningEffortForDriver(sessionDriver)) {
                    throw new Error('Model reasoning effort is not supported for this session driver')
                }
                assertSessionConfigCapability(
                    liveConfigSupport.canChangeModelReasoningEffort,
                    'Model reasoning effort is only supported for remote-managed sessions with reasoning controls'
                )

                return await sessionApi.setModelReasoningEffort(sessionId, modelReasoningEffort)
            })
        },
        [api, liveConfigSupport.canChangeModelReasoningEffort, runSessionConfigAction, sessionDriver, sessionId]
    )

    const handleCodexServiceTierChange = useCallback(
        async (codexServiceTier: CodexServiceTier | null) => {
            await runSessionConfigAction(async () => {
                const sessionApi = assertSessionConfigApi(api)
                if (sessionDriver !== 'codex') {
                    throw new Error('Codex fast mode is only supported for Codex sessions')
                }
                assertSessionConfigCapability(
                    liveConfigSupport.canChangeCodexServiceTier,
                    'Codex fast mode is only supported for remote-managed Codex sessions'
                )

                return await sessionApi.setCodexServiceTier(sessionId, codexServiceTier)
            })
        },
        [api, liveConfigSupport.canChangeCodexServiceTier, runSessionConfigAction, sessionDriver, sessionId]
    )

    const composerConfig = useMemo<ComposerConfigState>(
        () => ({
            permissionMode: session.permissionMode,
            collaborationMode: liveConfigSupport.canChangeCollaborationMode ? session.collaborationMode : undefined,
            model: session.model,
            modelCapabilities: sessionDriver === 'pi' ? piModelCapabilities : undefined,
            availableReasoningEfforts:
                sessionDriver === 'pi' ? (activePiCapability?.supportedThinkingLevels ?? null) : undefined,
            modelReasoningEffort: liveConfigSupport.canChangeModelReasoningEffort
                ? session.modelReasoningEffort
                : undefined,
            codexServiceTier: liveConfigSupport.canChangeCodexServiceTier ? session.codexServiceTier : undefined,
            sessionDriver,
            active: session.active,
            allowSendWhenInactive: options.allowSendWhenInactive,
            controlledByUser,
            attachmentsSupported: options.attachmentsSupported,
            switchTargetDrivers: switchTargetDrivers.length > 0 ? switchTargetDrivers : null,
            switchDriverPending: isSwitchingSessionDriver,
        }),
        [
            controlledByUser,
            isSwitchingSessionDriver,
            liveConfigSupport.canChangeCollaborationMode,
            liveConfigSupport.canChangeModelReasoningEffort,
            liveConfigSupport.canChangeCodexServiceTier,
            options.allowSendWhenInactive,
            options.attachmentsSupported,
            activePiCapability?.supportedThinkingLevels,
            piModelCapabilities,
            session.active,
            session.collaborationMode,
            session.model,
            session.modelReasoningEffort,
            session.codexServiceTier,
            session.permissionMode,
            sessionDriver,
            switchTargetDrivers,
        ]
    )

    const composerHandlers = useMemo<ComposerActionHandlers>(
        () => ({
            onCollaborationModeChange: liveConfigSupport.canChangeCollaborationMode
                ? handleCollaborationModeChange
                : undefined,
            onPermissionModeChange: canChangePermissionMode ? handlePermissionModeChange : undefined,
            onModelChange: liveConfigSupport.canChangeModel ? handleModelChange : undefined,
            onModelReasoningEffortChange: liveConfigSupport.canChangeModelReasoningEffort
                ? handleModelReasoningEffortChange
                : undefined,
            onCodexServiceTierChange: liveConfigSupport.canChangeCodexServiceTier
                ? handleCodexServiceTierChange
                : undefined,
            onSwitchSessionDriver: switchTargetDrivers.length > 0 ? handleSwitchSessionDriver : undefined,
            autocompleteSuggestions,
            autocompleteRefreshKey,
            onSuggestionAction,
        }),
        [
            autocompleteRefreshKey,
            autocompleteSuggestions,
            handleCollaborationModeChange,
            handleModelChange,
            handleModelReasoningEffortChange,
            handleCodexServiceTierChange,
            handlePermissionModeChange,
            handleSwitchSessionDriver,
            liveConfigSupport.canChangeCollaborationMode,
            liveConfigSupport.canChangeModel,
            liveConfigSupport.canChangeModelReasoningEffort,
            liveConfigSupport.canChangeCodexServiceTier,
            canChangePermissionMode,
            onSuggestionAction,
            switchTargetDrivers,
        ]
    )

    return {
        composerConfig,
        composerHandlers,
    }
}
