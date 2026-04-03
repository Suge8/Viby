import { useMemo } from 'react'
import {
    supportsLiveModelReasoningEffortForDriver,
    supportsLiveModelSelectionForDriver
} from '@viby/protocol'
import type {
    CodexCollaborationMode,
    CodexReasoningEffort,
    ModelReasoningEffort,
    PermissionMode,
} from '@/types/api'
import type { ComposerActionHandlers, ComposerConfigState } from '@/components/AssistantChat/composerTypes'
import { buildComposerControlSections } from '@/components/AssistantChat/composerPanelSections'
import { useComposerPlatform, type ComposerHaptic } from '@/components/AssistantChat/useComposerPlatform'
import {
    type ComposerPanelOption,
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

function getComposerReasoningEffortOptions(
    sessionDriver: string | null,
    modelReasoningEffort: ModelReasoningEffort | null,
    codexReasoningEffort: CodexReasoningEffort | null,
    availableReasoningEfforts: readonly ModelReasoningEffort[] | null,
    t: (key: string, params?: Record<string, string | number>) => string
): ComposerPanelOption<ModelReasoningEffort | null>[] {
    if (!supportsLiveModelReasoningEffortForDriver(sessionDriver)) {
        return []
    }

    if (sessionDriver === 'codex') {
        return getLocalizedReasoningEffortOptions(sessionDriver, codexReasoningEffort, null, t)
    }

    return getLocalizedReasoningEffortOptions(sessionDriver, modelReasoningEffort, availableReasoningEfforts, t)
}

export function useComposerLiveConfig(
    options: UseComposerLiveConfigOptions
): readonly React.ReactNode[] {
    const { t } = useTranslation()
    const {
        permissionMode = 'default',
        collaborationMode = 'default',
        model = null,
        piModelCapabilities = null,
        availableReasoningEfforts = null,
        modelReasoningEffort = null,
        sessionDriver = null,
        switchTargetDriver = null,
        switchDriverPending = false,
    } = options.config
    const codexReasoningEffort = useMemo(
        () => normalizeCodexReasoningEffort(modelReasoningEffort),
        [modelReasoningEffort]
    )
    const permissionModeOptions = useMemo(
        () => getLocalizedPermissionModeOptions(sessionDriver, t),
        [sessionDriver, t]
    )
    const collaborationModeOptions = useMemo(
        () => sessionDriver === 'codex' ? getLocalizedCollaborationModeOptions(t) : [],
        [sessionDriver, t]
    )
    const supportsModelSelection = useMemo(
        () => supportsLiveModelSelectionForDriver(sessionDriver),
        [sessionDriver]
    )
    const modelOptions = useMemo(() => {
        if (supportsModelSelection) {
            return getLocalizedModelOptions(sessionDriver, model, piModelCapabilities, t)
        }

        return []
    }, [model, piModelCapabilities, sessionDriver, supportsModelSelection, t])
    const supportsReasoningEffort = useMemo(
        () => supportsLiveModelReasoningEffortForDriver(sessionDriver),
        [sessionDriver]
    )
    const reasoningEffortOptions = useMemo(
        () => getComposerReasoningEffortOptions(
            sessionDriver,
            modelReasoningEffort,
            codexReasoningEffort,
            availableReasoningEfforts,
            t
        ),
        [availableReasoningEfforts, codexReasoningEffort, modelReasoningEffort, sessionDriver, t]
    )

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
        && supportsModelSelection
        && modelOptions.length > 0
    )
    const showReasoningEffortSettings = Boolean(
        options.handlers.onModelReasoningEffortChange
        && supportsReasoningEffort
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
        switchTargetDriver,
        switchDriverPending,
        onSwitchSessionDriver: switchTargetDriver && options.handlers.onSwitchSessionDriver
            ? () => {
                if (options.controlsDisabled || switchDriverPending) {
                    return
                }

                options.onClose()
                void options.handlers.onSwitchSessionDriver?.()
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
        model,
        modelOptions,
        modelReasoningEffort,
        options.controlsDisabled,
        options.handlers.onCollaborationModeChange,
        options.handlers.onModelChange,
        options.handlers.onModelReasoningEffortChange,
        options.handlers.onPermissionModeChange,
        options.handlers.onSwitchSessionDriver,
        options.onClose,
        permissionMode,
        permissionModeOptions,
        reasoningEffortOptions,
        runAction,
        showCollaborationSettings,
        showModelSettings,
        showPermissionSettings,
        showReasoningEffortSettings,
        switchDriverPending,
        switchTargetDriver,
        t,
    ])
}
