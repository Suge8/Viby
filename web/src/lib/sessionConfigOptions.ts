import {
    CLAUDE_SELECTABLE_MODEL_PRESETS,
    type ClaudeReasoningEffort,
    type CodexReasoningEffort,
    getClaudeModelLabel,
    getGeminiModelLabel,
    type ModelReasoningEffort,
    type PiModelCapability,
    type SessionDriver,
} from '@viby/protocol'
import {
    buildCuratedModelOptions,
    CODEX_MODEL_LABELS,
    COPILOT_MODEL_LABELS,
    CURATED_CLAUDE_REASONING_EFFORTS,
    CURATED_CODEX_MODELS,
    CURATED_CODEX_REASONING_EFFORTS,
    CURATED_COPILOT_MODELS,
    CURATED_GEMINI_MODELS,
    createReasoningEffortOption,
    createTerminalDefaultModelOption,
    createTerminalDefaultReasoningEffortOption,
    getComposerReasoningEffortOptions,
    getReasoningEffortLabel,
    type ModelReasoningEffortSelection,
    normalizeComposerStringValue,
    type SessionConfigOption,
    withCurrentOption,
} from '@/lib/sessionConfigOptionSupport'
import { findPiModelCapability, normalizePiModelCapabilities } from '@/lib/sessionConfigPiSupport'

export type { ModelReasoningEffortSelection, SessionConfigOption } from '@/lib/sessionConfigOptionSupport'
export { findPiModelCapability }

export const MODEL_OPTIONS: Record<SessionDriver, SessionConfigOption<string>[]> = {
    claude: buildCuratedModelOptions(
        'auto',
        CLAUDE_SELECTABLE_MODEL_PRESETS,
        (model) => getClaudeModelLabel(model) ?? model
    ),
    codex: buildCuratedModelOptions('auto', CURATED_CODEX_MODELS, (model) => CODEX_MODEL_LABELS[model]),
    copilot: buildCuratedModelOptions('auto', CURATED_COPILOT_MODELS, (model) => COPILOT_MODEL_LABELS[model]),
    cursor: [],
    gemini: buildCuratedModelOptions('auto', CURATED_GEMINI_MODELS, (model) => getGeminiModelLabel(model) ?? model),
    opencode: [],
    pi: [createTerminalDefaultModelOption('auto')],
}

export const REASONING_EFFORT_OPTIONS: Record<SessionDriver, SessionConfigOption<ModelReasoningEffortSelection>[]> = {
    claude: [
        createTerminalDefaultReasoningEffortOption('default'),
        ...CURATED_CLAUDE_REASONING_EFFORTS.map((effort) => createReasoningEffortOption(effort)),
    ],
    codex: [
        createTerminalDefaultReasoningEffortOption('default'),
        ...CURATED_CODEX_REASONING_EFFORTS.map((effort) => createReasoningEffortOption(effort)),
    ],
    copilot: [],
    cursor: [],
    gemini: [],
    opencode: [],
    pi: [createTerminalDefaultReasoningEffortOption('default')],
}

export const CODEX_REASONING_EFFORT_OPTIONS = REASONING_EFFORT_OPTIONS.codex
export const CLAUDE_REASONING_EFFORT_OPTIONS = REASONING_EFFORT_OPTIONS.claude

export function getClaudeComposerModelOptions(currentModel?: string | null): SessionConfigOption<string | null>[] {
    const options = buildCuratedModelOptions(
        null,
        CLAUDE_SELECTABLE_MODEL_PRESETS,
        (model) => getClaudeModelLabel(model) ?? model
    )

    return withCurrentOption(
        normalizeComposerStringValue(currentModel),
        options,
        (value) => CLAUDE_SELECTABLE_MODEL_PRESETS.includes(value as (typeof CLAUDE_SELECTABLE_MODEL_PRESETS)[number]),
        (value) => ({
            value,
            label: getClaudeModelLabel(value) ?? value,
        })
    )
}

export function getSessionModelDisplayLabel(model: string, sessionDriver?: string | null): string {
    return getSessionModelDisplayLabelWithCapabilities(model, sessionDriver)
}

export function getSessionModelDisplayLabelWithCapabilities(
    model: string,
    sessionDriver?: string | null,
    piModelCapabilities?: readonly PiModelCapability[] | null
): string {
    const normalizedModel = model.trim()
    if (!normalizedModel) {
        return model
    }

    if (sessionDriver === 'pi') {
        return piModelCapabilities?.find((capability) => capability.id === normalizedModel)?.label ?? normalizedModel
    }

    if (sessionDriver === 'codex') {
        return CODEX_MODEL_LABELS[normalizedModel as keyof typeof CODEX_MODEL_LABELS] ?? normalizedModel
    }

    if (sessionDriver === 'copilot') {
        return COPILOT_MODEL_LABELS[normalizedModel as keyof typeof COPILOT_MODEL_LABELS] ?? normalizedModel
    }

    if (sessionDriver === 'gemini') {
        return getGeminiModelLabel(normalizedModel) ?? normalizedModel
    }

    return getClaudeModelLabel(normalizedModel) ?? normalizedModel
}

export function getModelReasoningEffortDisplayLabel(effort: ModelReasoningEffort): string {
    return getReasoningEffortLabel(effort)
}

export function getCodexComposerModelOptions(currentModel?: string | null): SessionConfigOption<string | null>[] {
    const options = buildCuratedModelOptions(null, CURATED_CODEX_MODELS, (model) => CODEX_MODEL_LABELS[model])

    return withCurrentOption(
        normalizeComposerStringValue(currentModel),
        options,
        (value) => CURATED_CODEX_MODELS.includes(value as (typeof CURATED_CODEX_MODELS)[number]),
        (value) => ({
            value,
            label: value,
        })
    )
}

export function getGeminiComposerModelOptions(currentModel?: string | null): SessionConfigOption<string | null>[] {
    const options = buildCuratedModelOptions(
        null,
        CURATED_GEMINI_MODELS,
        (model) => getGeminiModelLabel(model) ?? model
    )

    return withCurrentOption(
        normalizeComposerStringValue(currentModel),
        options,
        (value) => CURATED_GEMINI_MODELS.includes(value as (typeof CURATED_GEMINI_MODELS)[number]),
        (value) => ({
            value,
            label: getGeminiModelLabel(value) ?? value,
        })
    )
}

export function getCopilotComposerModelOptions(currentModel?: string | null): SessionConfigOption<string | null>[] {
    const options = buildCuratedModelOptions(null, CURATED_COPILOT_MODELS, (model) => COPILOT_MODEL_LABELS[model])

    return withCurrentOption(
        normalizeComposerStringValue(currentModel),
        options,
        (value) => CURATED_COPILOT_MODELS.includes(value as (typeof CURATED_COPILOT_MODELS)[number]),
        (value) => ({
            value,
            label: COPILOT_MODEL_LABELS[value as (typeof CURATED_COPILOT_MODELS)[number]] ?? value,
        })
    )
}

export function getPiLaunchModelOptions(
    capabilities?: readonly PiModelCapability[] | null
): SessionConfigOption<string>[] {
    const normalizedCapabilities = normalizePiModelCapabilities(capabilities)

    return [
        createTerminalDefaultModelOption('auto'),
        ...normalizedCapabilities.map((capability) => ({
            value: capability.id,
            label: capability.label,
        })),
    ]
}

export function getPiLaunchReasoningEffortOptions(
    supportedEfforts?: readonly ModelReasoningEffort[] | null
): SessionConfigOption<ModelReasoningEffortSelection>[] {
    return [
        createTerminalDefaultReasoningEffortOption('default'),
        ...((supportedEfforts ?? []) as readonly ModelReasoningEffort[]).map((effort) =>
            createReasoningEffortOption(effort)
        ),
    ]
}

export function getPiComposerModelOptions(
    currentModel?: string | null,
    capabilities?: readonly PiModelCapability[] | null
): SessionConfigOption<string | null>[] {
    const normalizedCapabilities = normalizePiModelCapabilities(capabilities)
    if (normalizedCapabilities.length === 0 && !normalizeComposerStringValue(currentModel)) {
        return []
    }

    const options: SessionConfigOption<string | null>[] = [
        createTerminalDefaultModelOption(null),
        ...normalizedCapabilities.map((capability) => ({
            value: capability.id,
            label: capability.label,
        })),
    ]

    return withCurrentOption(
        normalizeComposerStringValue(currentModel),
        options,
        (value) => normalizedCapabilities.some((capability) => capability.id === value),
        (value) => ({
            value,
            label: value,
        })
    )
}

export function getCodexComposerReasoningEffortOptions(
    currentEffort?: CodexReasoningEffort | null
): SessionConfigOption<CodexReasoningEffort | null>[] {
    return getComposerReasoningEffortOptions(currentEffort, CURATED_CODEX_REASONING_EFFORTS)
}

export function getPiComposerReasoningEffortOptions(
    currentEffort?: ModelReasoningEffort | null,
    supportedEfforts?: readonly ModelReasoningEffort[] | null
): SessionConfigOption<ModelReasoningEffort | null>[] {
    return getComposerReasoningEffortOptions(currentEffort, (supportedEfforts ?? []) as readonly ModelReasoningEffort[])
}

export function getClaudeComposerReasoningEffortOptions(
    currentEffort?: ClaudeReasoningEffort | null
): SessionConfigOption<ClaudeReasoningEffort | null>[] {
    return getComposerReasoningEffortOptions(currentEffort, CURATED_CLAUDE_REASONING_EFFORTS)
}

export function getNextClaudeComposerModel(currentModel?: string | null): string | null {
    const normalizedCurrentModel = normalizeComposerStringValue(currentModel)
    const options = getClaudeComposerModelOptions(normalizedCurrentModel)
    const currentIndex = options.findIndex((option) => option.value === normalizedCurrentModel)

    if (currentIndex === -1) {
        return options[0]?.value ?? null
    }

    return options[(currentIndex + 1) % options.length]?.value ?? null
}
