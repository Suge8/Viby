import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
    isPermissionModeAllowedForDriver,
    resolveSessionDriver,
    supportsLiveModelReasoningEffortForDriver,
    type LiveSessionConfigSupport
} from '@viby/protocol'
import type { ApiClient } from '@/api/client'
import type {
    CodexCollaborationMode,
    ModelReasoningEffort,
    PiModelCapability,
    PermissionMode,
    Session
} from '@/types/api'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import type { ComposerActionHandlers, ComposerConfigState } from '@/components/AssistantChat/composerTypes'
import { usePlatform } from '@/hooks/usePlatform'
import { useNoticeCenter } from '@/lib/notice-center'
import { getOtherSameSessionSwitchTargetDriver } from '@/lib/sameSessionDriverSwitch'
import { writeSessionToQueryCache } from '@/lib/sessionQueryCache'
import { formatUserFacingErrorMessage } from '@/lib/userFacingError'
import { useTranslation } from '@/lib/use-translation'

type SessionConfigMutationOptions = {
    api: ApiClient
    session: Session
    liveConfigSupport: LiveSessionConfigSupport
    onSwitchSessionDriver: () => Promise<void>
    isSwitchingSessionDriver: boolean
    autocompleteSuggestions?: (query: string) => Promise<Suggestion[]>
    attachmentsSupported: boolean
    allowSendWhenInactive: boolean
    isResumingSession: boolean
}

type TranslationFn = (key: string, params?: Record<string, string | number>) => string

const SWITCH_DRIVER_ERROR_CODE_MAP = {
    session_not_idle: 'chat.switchDriver.failed.sessionNotIdle',
    session_not_found: 'chat.switchDriver.failed.sessionNotFound',
    unsupported_target_driver: 'chat.switchDriver.failed.generic',
    handoff_build_failed: 'chat.switchDriver.failed.generic',
    stop_failed: 'chat.switchDriver.failed.generic',
    stop_timeout: 'chat.switchDriver.failed.generic',
    spawn_failed: 'chat.switchDriver.failed.generic',
    spawn_session_mismatch: 'chat.switchDriver.failed.generic',
    attach_timeout: 'chat.switchDriver.failed.generic',
    attach_failed: 'chat.switchDriver.failed.generic',
    marker_append_failed: 'chat.switchDriver.failed.generic',
} as const

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

function formatSwitchDriverErrorMessage(error: unknown, t: TranslationFn): string {
    return formatUserFacingErrorMessage(error, {
        t,
        fallbackKey: 'chat.switchDriver.failed.generic',
        codeMap: SWITCH_DRIVER_ERROR_CODE_MAP,
        messageMap: [
            {
                match: 'Invalid driver switch response',
                key: 'chat.switchDriver.failed.generic'
            }
        ]
    })
}

function resolveActivePiCapability(
    currentModel: string | null | undefined,
    capabilities: readonly PiModelCapability[] | null | undefined
): PiModelCapability | null {
    if (!capabilities || capabilities.length === 0) {
        return null
    }

    const normalizedModel = currentModel?.trim()
    if (!normalizedModel) {
        return null
    }

    return capabilities.find((capability) => capability.id === normalizedModel) ?? null
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
        autocompleteSuggestions
    } = options
    const sessionDriver = resolveSessionDriver(session.metadata)
    const switchTargetDriver = session.active ? getOtherSameSessionSwitchTargetDriver(sessionDriver) : null
    const controlledByUser = session.agentState?.controlledByUser === true
    const sessionId = session.id
    const piModelCapabilities = sessionDriver === 'pi'
        ? (session.metadata?.piModelScope?.models ?? [])
        : []
    const activePiCapability = resolveActivePiCapability(session.model, piModelCapabilities)

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

    const handleSwitchSessionDriver = useCallback(async () => {
        if (!switchTargetDriver || isSwitchingSessionDriver) {
            return
        }

        try {
            await onSwitchSessionDriver()
            haptic.notification('success')
        } catch (error) {
            const description = formatSwitchDriverErrorMessage(error, t)
            console.error('Failed to switch session driver from composer controls:', error)
            addToast({
                title: t('chat.switchDriver.failed.title'),
                description,
                tone: 'danger'
            })
            haptic.notification('error')
        }
    }, [
        addToast,
        haptic,
        isSwitchingSessionDriver,
        onSwitchSessionDriver,
        switchTargetDriver,
        t
    ])

    const handlePermissionModeChange = useCallback(async (mode: PermissionMode) => {
        await runSessionConfigAction(async () => {
            const sessionApi = assertSessionConfigApi(api)
            assertSessionConfigCapability(
                liveConfigSupport.canChangePermissionMode,
                'Permission mode is only supported for Viby-managed active sessions'
            )
            if (sessionDriver && !isPermissionModeAllowedForDriver(mode, sessionDriver)) {
                throw new Error('Invalid permission mode for session driver')
            }

            return await sessionApi.setPermissionMode(sessionId, mode)
        })
    }, [api, liveConfigSupport.canChangePermissionMode, runSessionConfigAction, sessionDriver, sessionId])

    const handleCollaborationModeChange = useCallback(async (mode: CodexCollaborationMode) => {
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
    }, [api, liveConfigSupport.canChangeCollaborationMode, runSessionConfigAction, sessionDriver, sessionId])

    const handleModelChange = useCallback(async (model: string | null) => {
        await runSessionConfigAction(async () => {
            const sessionApi = assertSessionConfigApi(api)
            assertSessionConfigCapability(
                liveConfigSupport.canChangeModel,
                'Model selection is only supported for remote Claude, Codex, Gemini, and Pi sessions'
            )

            return await sessionApi.setModel(sessionId, model)
        })
    }, [api, liveConfigSupport.canChangeModel, runSessionConfigAction, sessionId])

    const handleModelReasoningEffortChange = useCallback(async (modelReasoningEffort: ModelReasoningEffort | null) => {
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
    }, [
        api,
        liveConfigSupport.canChangeModelReasoningEffort,
        runSessionConfigAction,
        sessionDriver,
        sessionId
    ])

    const composerConfig = useMemo<ComposerConfigState>(() => ({
        permissionMode: session.permissionMode,
        collaborationMode: liveConfigSupport.canChangeCollaborationMode ? session.collaborationMode : undefined,
        model: session.model,
        piModelCapabilities: sessionDriver === 'pi' ? piModelCapabilities : undefined,
        availableReasoningEfforts: sessionDriver === 'pi'
            ? (activePiCapability?.supportedThinkingLevels ?? null)
            : undefined,
        modelReasoningEffort: liveConfigSupport.canChangeModelReasoningEffort ? session.modelReasoningEffort : undefined,
        isResuming: options.isResumingSession,
        sessionDriver,
        active: session.active,
        allowSendWhenInactive: options.allowSendWhenInactive,
        controlledByUser,
        attachmentsSupported: options.attachmentsSupported,
        switchTargetDriver,
        switchDriverPending: isSwitchingSessionDriver,
    }), [
        controlledByUser,
        isSwitchingSessionDriver,
        liveConfigSupport.canChangeCollaborationMode,
        liveConfigSupport.canChangeModelReasoningEffort,
        options.allowSendWhenInactive,
        options.attachmentsSupported,
        options.isResumingSession,
        activePiCapability?.supportedThinkingLevels,
        piModelCapabilities,
        session.active,
        session.collaborationMode,
        session.model,
        session.modelReasoningEffort,
        session.permissionMode,
        sessionDriver,
        switchTargetDriver
    ])

    const composerHandlers = useMemo<ComposerActionHandlers>(() => ({
        onCollaborationModeChange: liveConfigSupport.canChangeCollaborationMode ? handleCollaborationModeChange : undefined,
        onPermissionModeChange: liveConfigSupport.canChangePermissionMode ? handlePermissionModeChange : undefined,
        onModelChange: liveConfigSupport.canChangeModel ? handleModelChange : undefined,
        onModelReasoningEffortChange: liveConfigSupport.canChangeModelReasoningEffort
            ? handleModelReasoningEffortChange
            : undefined,
        onSwitchSessionDriver: switchTargetDriver ? handleSwitchSessionDriver : undefined,
        autocompleteSuggestions,
    }), [
        autocompleteSuggestions,
        handleCollaborationModeChange,
        handleModelChange,
        handleModelReasoningEffortChange,
        handlePermissionModeChange,
        handleSwitchSessionDriver,
        liveConfigSupport.canChangeCollaborationMode,
        liveConfigSupport.canChangeModel,
        liveConfigSupport.canChangeModelReasoningEffort,
        liveConfigSupport.canChangePermissionMode,
        switchTargetDriver
    ])

    return {
        composerConfig,
        composerHandlers
    }
}
