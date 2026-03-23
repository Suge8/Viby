import { useMemo } from 'react'
import type {
    ClaudeReasoningEffort,
    CodexCollaborationMode,
    CodexReasoningEffort,
    ModelReasoningEffort,
    PermissionMode,
} from '@/types/api'
import type { ComposerActionHandlers, ComposerConfigState } from '@/components/AssistantChat/composerTypes'
import { buildComposerControlSections } from '@/components/AssistantChat/composerPanelSections'
import { isClaudeFlavor } from '@/lib/agentFlavorUtils'
import { useComposerPlatform, type ComposerHaptic } from '@/components/AssistantChat/useComposerPlatform'
import {
    getLocalizedCollaborationModeOptions,
    getLocalizedModelOptions,
    getLocalizedPermissionModeOptions,
    getLocalizedReasoningEffortOptions,
} from '@/lib/sessionConfigPresentation'
import { useTranslation } from '@/lib/use-translation'

type UseComposerLiveConfigOptions = {
    config: ComposerConfigState
    handlers: ComposerActionHandlers
    controlsDisabled: boolean
    onClose: () => void
}

const CODEX_REASONING_EFFORT_SET = new Set<CodexReasoningEffort>(['low', 'medium', 'high', 'xhigh'])

function normalizeCodexReasoningEffort(value: ModelReasoningEffort | null): CodexReasoningEffort | null {
    if (!value || !CODEX_REASONING_EFFORT_SET.has(value as CodexReasoningEffort)) {
        return null
    }

    return value as CodexReasoningEffort
}

function createHapticRunner(onClose: () => void, controlsDisabled: boolean, haptic: ComposerHaptic) {
    return function runAction<T>(handler: ((value: T) => void) | undefined, value: T): void {
        if (!handler || controlsDisabled) {
            return
        }

        handler(value)
        onClose()
        haptic('light')
    }
}

export function useComposerLiveConfig(
    options: UseComposerLiveConfigOptions
): readonly React.ReactNode[] {
    const { t } = useTranslation()
    const {
        permissionMode = 'default',
        collaborationMode = 'default',
        model = null,
        modelReasoningEffort = null,
        agentFlavor = null,
        controlledByUser = false,
    } = options.config
    const codexReasoningEffort = useMemo(
        () => normalizeCodexReasoningEffort(modelReasoningEffort),
        [modelReasoningEffort]
    )
    const permissionModeOptions = useMemo(
        () => getLocalizedPermissionModeOptions(agentFlavor, t),
        [agentFlavor, t]
    )
    const collaborationModeOptions = useMemo(
        () => agentFlavor === 'codex' ? getLocalizedCollaborationModeOptions(t) : [],
        [agentFlavor, t]
    )
    const modelOptions = useMemo(() => {
        if (agentFlavor === 'claude' || agentFlavor === 'codex') {
            return getLocalizedModelOptions(agentFlavor, model, t)
        }

        return []
    }, [agentFlavor, model, t])
    const reasoningEffortOptions = useMemo(() => {
        if (agentFlavor === 'claude') {
            return getLocalizedReasoningEffortOptions(
                agentFlavor,
                modelReasoningEffort as ClaudeReasoningEffort | null,
                t
            )
        }

        if (agentFlavor === 'codex') {
            return getLocalizedReasoningEffortOptions(agentFlavor, codexReasoningEffort, t)
        }

        return []
    }, [agentFlavor, codexReasoningEffort, modelReasoningEffort, t])

    const { haptic } = useComposerPlatform()
    const runAction = useMemo(
        () => createHapticRunner(options.onClose, options.controlsDisabled, haptic),
        [haptic, options.controlsDisabled, options.onClose]
    )

    const showCollaborationSettings = Boolean(
        options.handlers.onCollaborationModeChange && collaborationModeOptions.length > 0
    )
    const showPermissionSettings = Boolean(
        options.handlers.onPermissionModeChange && permissionModeOptions.length > 0
    )
    const showModelSettings = Boolean(
        options.handlers.onModelChange
        && (isClaudeFlavor(agentFlavor) || agentFlavor === 'codex')
        && modelOptions.length > 0
    )
    const showReasoningEffortSettings = Boolean(
        options.handlers.onModelReasoningEffortChange
        && (agentFlavor === 'claude' || agentFlavor === 'codex')
        && reasoningEffortOptions.length > 0
    )

    return useMemo(() => buildComposerControlSections({
        collaborationMode,
        collaborationModeOptions,
        controlsDisabled: options.controlsDisabled,
        onCollaborationChange: (value: CodexCollaborationMode) => runAction(options.handlers.onCollaborationModeChange, value),
        onModelChange: (value: string | null) => runAction(options.handlers.onModelChange, value),
        onModelReasoningEffortChange: (value: ModelReasoningEffort | null) => runAction(options.handlers.onModelReasoningEffortChange, value),
        onPermissionChange: (value: PermissionMode) => runAction(options.handlers.onPermissionModeChange, value),
        onSwitchToRemote: controlledByUser && options.handlers.onSwitchToRemote
            ? () => {
                if (options.controlsDisabled) {
                    return
                }

                options.onClose()
                haptic('light')
                void options.handlers.onSwitchToRemote?.()
            }
            : undefined,
        model,
        modelOptions,
        modelReasoningEffort,
        permissionMode,
        permissionModeOptions,
        reasoningEffortOptions,
        showCollaborationSettings,
        showModelSettings,
        showPermissionSettings,
        showReasoningEffortSettings,
        t,
    }), [
        collaborationMode,
        collaborationModeOptions,
        controlledByUser,
        haptic,
        model,
        modelOptions,
        modelReasoningEffort,
        options.controlsDisabled,
        options.handlers.onCollaborationModeChange,
        options.handlers.onModelChange,
        options.handlers.onModelReasoningEffortChange,
        options.handlers.onPermissionModeChange,
        options.handlers.onSwitchToRemote,
        options.onClose,
        permissionMode,
        permissionModeOptions,
        reasoningEffortOptions,
        runAction,
        showCollaborationSettings,
        showModelSettings,
        showPermissionSettings,
        showReasoningEffortSettings,
        t,
    ])
}
