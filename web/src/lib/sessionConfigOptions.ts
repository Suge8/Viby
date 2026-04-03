import {
    CLAUDE_REASONING_EFFORTS,
    CLAUDE_SELECTABLE_MODEL_PRESETS,
    GEMINI_MODEL_PRESETS,
    getClaudeModelLabel,
    getClaudeReasoningEffortLabel,
    getCodexReasoningEffortLabel,
    getGeminiModelLabel,
    type ClaudeReasoningEffort,
    type CodexReasoningEffort,
    type GeminiModelPreset,
    type ModelReasoningEffort,
    type PiModelCapability,
    type SessionDriver,
} from '@viby/protocol'

export type SessionConfigOption<T extends string | null> = {
    value: T
    label: string
    labelKey?: string
}

export type ModelReasoningEffortSelection = ModelReasoningEffort | 'default'

const TERMINAL_DEFAULT_MODEL_LABEL_KEY = 'model.terminalDefault'
const TERMINAL_DEFAULT_REASONING_EFFORT_LABEL_KEY = 'reasoningEffort.terminalDefault'
const CURATED_CODEX_MODELS = ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.2'] as const
const CURATED_GEMINI_MODELS = [...GEMINI_MODEL_PRESETS] as const satisfies readonly GeminiModelPreset[]
const CURATED_CLAUDE_REASONING_EFFORTS = [...CLAUDE_REASONING_EFFORTS] as const
const CURATED_CODEX_REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh'] as const satisfies readonly CodexReasoningEffort[]
const REASONING_EFFORT_LABEL_KEYS: Record<ModelReasoningEffort, string> = {
    none: 'reasoningEffort.none',
    minimal: 'reasoningEffort.minimal',
    low: 'reasoningEffort.low',
    medium: 'reasoningEffort.medium',
    high: 'reasoningEffort.high',
    xhigh: 'reasoningEffort.xhigh',
    max: 'reasoningEffort.max',
}
const CODEX_MODEL_LABELS: Record<(typeof CURATED_CODEX_MODELS)[number], string> = {
    'gpt-5.4': 'GPT-5.4',
    'gpt-5.4-mini': 'GPT-5.4 Mini',
    'gpt-5.3-codex': 'GPT-5.3 Codex',
    'gpt-5.2': 'GPT-5.2',
}

function buildCuratedModelOptions<TDefault extends string | null, TModel extends string>(
    defaultValue: TDefault,
    models: readonly TModel[],
    getLabel: (model: TModel) => string
): SessionConfigOption<TDefault | TModel>[] {
    return [
        createTerminalDefaultModelOption(defaultValue),
        ...models.map((model) => ({
            value: model,
            label: getLabel(model),
        })),
    ]
}

function withCurrentOption<T extends string>(
    currentValue: T | null | undefined,
    options: SessionConfigOption<T | null>[],
    isKnownValue: (value: T) => boolean,
    buildOption: (value: T) => SessionConfigOption<T | null>
): SessionConfigOption<T | null>[] {
    if (!currentValue || isKnownValue(currentValue)) {
        return options
    }

    return [
        options[0] ?? { value: null, label: '' },
        buildOption(currentValue),
        ...options.slice(1),
    ]
}

function createTerminalDefaultModelOption<T extends string | null>(value: T): SessionConfigOption<T> {
    return {
        value,
        label: 'Terminal default model',
        labelKey: TERMINAL_DEFAULT_MODEL_LABEL_KEY,
    }
}

function createTerminalDefaultReasoningEffortOption<T extends ModelReasoningEffortSelection | null>(value: T): SessionConfigOption<T> {
    return {
        value,
        label: 'Terminal default reasoning effort',
        labelKey: TERMINAL_DEFAULT_REASONING_EFFORT_LABEL_KEY,
    }
}

function createReasoningEffortOption<T extends ModelReasoningEffort | ModelReasoningEffortSelection>(value: T): SessionConfigOption<T> {
    return {
        value,
        label: getReasoningEffortLabel(value as ModelReasoningEffort),
        labelKey: REASONING_EFFORT_LABEL_KEYS[value as ModelReasoningEffort],
    }
}

export const MODEL_OPTIONS: Record<SessionDriver, SessionConfigOption<string>[]> = {
    claude: buildCuratedModelOptions('auto', CLAUDE_SELECTABLE_MODEL_PRESETS, (model) => getClaudeModelLabel(model) ?? model),
    codex: buildCuratedModelOptions('auto', CURATED_CODEX_MODELS, (model) => CODEX_MODEL_LABELS[model]),
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
    cursor: [],
    gemini: [],
    opencode: [],
    pi: [createTerminalDefaultReasoningEffortOption('default')],
}

export const CODEX_REASONING_EFFORT_OPTIONS = REASONING_EFFORT_OPTIONS.codex
export const CLAUDE_REASONING_EFFORT_OPTIONS = REASONING_EFFORT_OPTIONS.claude

function getComposerReasoningEffortOptions<T extends ModelReasoningEffort>(
    currentEffort: T | null | undefined,
    supportedEfforts: readonly T[]
): SessionConfigOption<T | null>[] {
    if (supportedEfforts.length === 0 && !currentEffort) {
        return []
    }

    const options: SessionConfigOption<T | null>[] = [
        createTerminalDefaultReasoningEffortOption(null),
        ...supportedEfforts.map((effort) => createReasoningEffortOption(effort)),
    ]

    return withCurrentOption(
        currentEffort,
        options,
        (value) => supportedEfforts.includes(value),
        (value) => createReasoningEffortOption(value)
    )
}

export function getClaudeComposerModelOptions(currentModel?: string | null): SessionConfigOption<string | null>[] {
    const options = buildCuratedModelOptions(null, CLAUDE_SELECTABLE_MODEL_PRESETS, (model) => getClaudeModelLabel(model) ?? model)

    return withCurrentOption(
        normalizeComposerStringValue(currentModel),
        options,
        (value) => CLAUDE_SELECTABLE_MODEL_PRESETS.includes(value as typeof CLAUDE_SELECTABLE_MODEL_PRESETS[number]),
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
        (value) => CURATED_CODEX_MODELS.includes(value as typeof CURATED_CODEX_MODELS[number]),
        (value) => ({
            value,
            label: value,
        })
    )
}

export function getGeminiComposerModelOptions(currentModel?: string | null): SessionConfigOption<string | null>[] {
    const options = buildCuratedModelOptions(null, CURATED_GEMINI_MODELS, (model) => getGeminiModelLabel(model) ?? model)

    return withCurrentOption(
        normalizeComposerStringValue(currentModel),
        options,
        (value) => CURATED_GEMINI_MODELS.includes(value as typeof CURATED_GEMINI_MODELS[number]),
        (value) => ({
            value,
            label: getGeminiModelLabel(value) ?? value,
        })
    )
}

function normalizePiModelCapabilities(capabilities?: readonly PiModelCapability[] | null): PiModelCapability[] {
    if (!capabilities || capabilities.length === 0) {
        return []
    }

    const seen = new Set<string>()
    const normalized: PiModelCapability[] = []
    for (const capability of capabilities) {
        const id = capability.id.trim()
        if (!id || seen.has(id)) {
            continue
        }

        seen.add(id)
        normalized.push({
            ...capability,
            id,
            label: capability.label.trim() || id,
            supportedThinkingLevels: capability.supportedThinkingLevels
        })
    }

    return normalized
}

export function findPiModelCapability(
    currentModel?: string | null,
    capabilities?: readonly PiModelCapability[] | null
): PiModelCapability | null {
    const normalizedCapabilities = normalizePiModelCapabilities(capabilities)
    const normalizedModel = normalizeComposerStringValue(currentModel)
    if (!normalizedModel) {
        return null
    }

    return normalizedCapabilities.find((capability) => capability.id === normalizedModel) ?? null
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
        ...((supportedEfforts ?? []) as readonly ModelReasoningEffort[]).map((effort) => createReasoningEffortOption(effort)),
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
    return getComposerReasoningEffortOptions(
        currentEffort,
        (supportedEfforts ?? []) as readonly ModelReasoningEffort[]
    )
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

function normalizeComposerStringValue(value?: string | null): string | null {
    const trimmed = value?.trim()
    if (!trimmed || trimmed === 'auto' || trimmed === 'default') {
        return null
    }

    return trimmed
}

function getReasoningEffortLabel(effort: ModelReasoningEffort): string {
    if (effort === 'max') {
        return getClaudeReasoningEffortLabel(effort)
    }

    return getCodexReasoningEffortLabel(effort as CodexReasoningEffort)
}
