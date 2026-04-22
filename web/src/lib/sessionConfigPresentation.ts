import {
    type CodexCollaborationMode,
    getPermissionModesForDriver,
    type PermissionMode,
    type PiModelCapability,
} from '@viby/protocol'
import {
    getClaudeComposerModelOptions,
    getClaudeComposerReasoningEffortOptions,
    getCodexComposerModelOptions,
    getCodexComposerReasoningEffortOptions,
    getCopilotComposerModelOptions,
    getGeminiComposerModelOptions,
    getPiComposerModelOptions,
    getPiComposerReasoningEffortOptions,
    getSessionModelDisplayLabelWithCapabilities,
    type SessionConfigOption,
} from '@/lib/sessionConfigOptions'
import type { ModelReasoningEffort } from '@/types/api'

export type ComposerOptionTone = 'neutral' | 'brand' | 'warning' | 'danger'

export type ComposerPanelOption<T extends string | null> = SessionConfigOption<T> & {
    description?: string
    tone?: ComposerOptionTone
}

type Translate = (key: string) => string

function getPermissionTone(mode: PermissionMode): ComposerOptionTone {
    switch (mode) {
        case 'plan':
        case 'ask':
            return 'brand'
        case 'acceptEdits':
        case 'read-only':
        case 'safe-yolo':
            return 'warning'
        case 'bypassPermissions':
        case 'yolo':
            return 'danger'
        default:
            return 'neutral'
    }
}

function translateModelOption<T extends string | null>(
    option: SessionConfigOption<T>,
    sessionDriver: string | null,
    piModelCapabilities: readonly PiModelCapability[] | null | undefined,
    t: Translate
): string {
    if (option.labelKey) {
        return t(option.labelKey)
    }

    if (typeof option.value === 'string') {
        return getSessionModelDisplayLabelWithCapabilities(option.value, sessionDriver, piModelCapabilities)
    }

    return option.label
}

function getPermissionLabel(mode: PermissionMode, t: Translate): string {
    switch (mode) {
        case 'acceptEdits':
            return t('sessionConfig.permission.acceptEdits.label')
        case 'bypassPermissions':
            return t('sessionConfig.permission.bypassPermissions.label')
        case 'plan':
            return t('sessionConfig.permission.plan.label')
        case 'ask':
            return t('sessionConfig.permission.ask.label')
        case 'read-only':
            return t('sessionConfig.permission.readOnly.label')
        case 'safe-yolo':
            return t('sessionConfig.permission.safeYolo.label')
        case 'yolo':
            return t('sessionConfig.permission.yolo.label')
        default:
            return t('sessionConfig.permission.default.label')
    }
}

function getPermissionDescription(mode: PermissionMode, t: Translate): string {
    switch (mode) {
        case 'acceptEdits':
            return t('sessionConfig.permission.acceptEdits.description')
        case 'bypassPermissions':
            return t('sessionConfig.permission.bypassPermissions.description')
        case 'plan':
            return t('sessionConfig.permission.plan.description')
        case 'ask':
            return t('sessionConfig.permission.ask.description')
        case 'read-only':
            return t('sessionConfig.permission.readOnly.description')
        case 'safe-yolo':
            return t('sessionConfig.permission.safeYolo.description')
        case 'yolo':
            return t('sessionConfig.permission.yolo.description')
        default:
            return t('sessionConfig.permission.default.description')
    }
}

function getCollaborationDescription(mode: CodexCollaborationMode, t: Translate): string {
    return mode === 'plan'
        ? t('sessionConfig.collaboration.plan.description')
        : t('sessionConfig.collaboration.default.description')
}

function getModelDescription(value: string | null, sessionDriver: string | null, t: Translate): string | undefined {
    if (value === null) {
        return t('sessionConfig.model.terminalDefault.description')
    }

    if (sessionDriver === 'codex') {
        switch (value) {
            case 'gpt-5.4':
                return t('sessionConfig.model.gpt54.description')
            case 'gpt-5.4-mini':
                return t('sessionConfig.model.gpt54Mini.description')
            case 'gpt-5.3-codex':
                return t('sessionConfig.model.gpt53Codex.description')
            case 'gpt-5.2':
                return t('sessionConfig.model.gpt52.description')
            default:
                return t('sessionConfig.model.custom.description')
        }
    }

    if (sessionDriver === 'claude') {
        return t('sessionConfig.model.custom.description')
    }

    if (sessionDriver === 'gemini') {
        switch (value) {
            case 'gemini-2.5-pro':
                return t('sessionConfig.model.gemini25Pro.description')
            case 'gemini-2.5-flash':
                return t('sessionConfig.model.gemini25Flash.description')
            case 'gemini-2.5-flash-lite':
                return t('sessionConfig.model.gemini25FlashLite.description')
            case 'gemini-3-pro-preview':
            case 'gemini-3-flash-preview':
                return t('sessionConfig.model.preview.description')
            default:
                return t('sessionConfig.model.custom.description')
        }
    }

    return undefined
}

function getReasoningDescription(value: ModelReasoningEffort | null, t: Translate): string | undefined {
    switch (value) {
        case null:
            return t('sessionConfig.reasoning.terminalDefault.description')
        case 'none':
            return t('sessionConfig.reasoning.none.description')
        case 'minimal':
            return t('sessionConfig.reasoning.minimal.description')
        case 'low':
            return t('sessionConfig.reasoning.low.description')
        case 'medium':
            return t('sessionConfig.reasoning.medium.description')
        case 'high':
            return t('sessionConfig.reasoning.high.description')
        case 'xhigh':
            return t('sessionConfig.reasoning.xhigh.description')
        case 'max':
            return t('sessionConfig.reasoning.max.description')
        default:
            return undefined
    }
}

function getModelOptionsForDriver(
    sessionDriver: string | null,
    currentModel: string | null,
    piModelCapabilities?: readonly PiModelCapability[] | null
): SessionConfigOption<string | null>[] {
    if (sessionDriver === 'claude') {
        return getClaudeComposerModelOptions(currentModel)
    }

    if (sessionDriver === 'copilot') {
        return getCopilotComposerModelOptions(currentModel)
    }

    if (sessionDriver === 'gemini') {
        return getGeminiComposerModelOptions(currentModel)
    }

    if (sessionDriver === 'pi') {
        return getPiComposerModelOptions(currentModel, piModelCapabilities)
    }

    if (sessionDriver === 'codex') {
        return getCodexComposerModelOptions(currentModel)
    }

    return []
}

export function getLocalizedPermissionModeOptions(
    sessionDriver: string | null,
    t: Translate
): ComposerPanelOption<PermissionMode>[] {
    return getPermissionModesForDriver(sessionDriver).map((mode) => ({
        value: mode,
        label: getPermissionLabel(mode, t),
        description: getPermissionDescription(mode, t),
        tone: getPermissionTone(mode),
    }))
}

export function getLocalizedCollaborationModeOptions(t: Translate): ComposerPanelOption<CodexCollaborationMode>[] {
    return [
        {
            value: 'default',
            label: t('sessionConfig.collaboration.default.label'),
            description: getCollaborationDescription('default', t),
            tone: 'neutral',
        },
        {
            value: 'plan',
            label: t('sessionConfig.collaboration.plan.label'),
            description: getCollaborationDescription('plan', t),
            tone: 'brand',
        },
    ]
}

export function getLocalizedModelOptions(
    sessionDriver: string | null,
    currentModel: string | null,
    piModelCapabilities: readonly PiModelCapability[] | null | undefined,
    t: Translate
): ComposerPanelOption<string | null>[] {
    const options = getModelOptionsForDriver(sessionDriver, currentModel, piModelCapabilities)

    return options.map((option) => ({
        ...option,
        label: translateModelOption(option, sessionDriver, piModelCapabilities, t),
        description: getModelDescription(option.value, sessionDriver, t),
        tone: option.value === null ? 'neutral' : 'brand',
    }))
}

export function getLocalizedReasoningEffortOptions(
    sessionDriver: string | null,
    currentEffort: ModelReasoningEffort | null,
    supportedEfforts: readonly ModelReasoningEffort[] | null | undefined,
    t: Translate
): ComposerPanelOption<ModelReasoningEffort | null>[] {
    const options =
        sessionDriver === 'claude'
            ? getClaudeComposerReasoningEffortOptions(currentEffort as never)
            : sessionDriver === 'pi'
              ? getPiComposerReasoningEffortOptions(currentEffort, supportedEfforts)
              : getCodexComposerReasoningEffortOptions(currentEffort as never)

    return options.map((option) => ({
        ...option,
        label: option.labelKey ? t(option.labelKey) : option.label,
        description: getReasoningDescription(option.value, t),
        tone: option.value === null ? 'neutral' : 'brand',
    }))
}
