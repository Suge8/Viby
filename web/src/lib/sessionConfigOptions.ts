import {
    CLAUDE_REASONING_EFFORTS,
    CLAUDE_SELECTABLE_MODEL_PRESETS,
    getClaudeModelLabel,
    getClaudeReasoningEffortLabel,
    getCodexReasoningEffortLabel,
    type ClaudeReasoningEffort,
    type CodexReasoningEffort,
    type ModelReasoningEffort,
} from '@viby/protocol'

type SessionConfigAgentType = 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'

export type SessionConfigOption<T extends string | null> = {
    value: T
    label: string
    labelKey?: string
}

export type ModelReasoningEffortSelection = ModelReasoningEffort | 'default'

const TERMINAL_DEFAULT_MODEL_LABEL_KEY = 'model.terminalDefault'
const TERMINAL_DEFAULT_REASONING_EFFORT_LABEL_KEY = 'reasoningEffort.terminalDefault'
const CURATED_CODEX_MODELS = ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.2'] as const
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

export const MODEL_OPTIONS: Record<SessionConfigAgentType, SessionConfigOption<string>[]> = {
    claude: [
        createTerminalDefaultModelOption('auto'),
        { value: 'sonnet[1m]', label: 'Sonnet' },
        { value: 'opus[1m]', label: 'Opus' },
    ],
    codex: [
        createTerminalDefaultModelOption('auto'),
        ...CURATED_CODEX_MODELS.map((model) => ({ value: model, label: CODEX_MODEL_LABELS[model] })),
    ],
    cursor: [],
    gemini: [
        { value: 'auto', label: 'Auto' },
        { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
        { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    ],
    opencode: [],
}

export const REASONING_EFFORT_OPTIONS: Record<SessionConfigAgentType, SessionConfigOption<ModelReasoningEffortSelection>[]> = {
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
}

export const CODEX_REASONING_EFFORT_OPTIONS = REASONING_EFFORT_OPTIONS.codex
export const CLAUDE_REASONING_EFFORT_OPTIONS = REASONING_EFFORT_OPTIONS.claude

export function getClaudeComposerModelOptions(currentModel?: string | null): SessionConfigOption<string | null>[] {
    const options: SessionConfigOption<string | null>[] = [
        createTerminalDefaultModelOption(null),
        ...CLAUDE_SELECTABLE_MODEL_PRESETS.map((model) => ({
            value: model,
            label: getClaudeModelLabel(model) ?? model,
        })),
    ]

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

export function getSessionModelDisplayLabel(model: string, flavor?: string | null): string {
    const normalizedModel = model.trim()
    if (!normalizedModel) {
        return model
    }

    if (flavor === 'codex') {
        return CODEX_MODEL_LABELS[normalizedModel as keyof typeof CODEX_MODEL_LABELS] ?? normalizedModel
    }

    return getClaudeModelLabel(normalizedModel) ?? normalizedModel
}

export function getModelReasoningEffortDisplayLabel(effort: ModelReasoningEffort): string {
    return getReasoningEffortLabel(effort)
}

export function getCodexComposerModelOptions(currentModel?: string | null): SessionConfigOption<string | null>[] {
    const options: SessionConfigOption<string | null>[] = [
        createTerminalDefaultModelOption(null),
        ...CURATED_CODEX_MODELS.map((model) => ({ value: model, label: CODEX_MODEL_LABELS[model] })),
    ]

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

export function getCodexComposerReasoningEffortOptions(
    currentEffort?: CodexReasoningEffort | null
): SessionConfigOption<CodexReasoningEffort | null>[] {
    const options: SessionConfigOption<CodexReasoningEffort | null>[] = [
        createTerminalDefaultReasoningEffortOption(null),
        ...CURATED_CODEX_REASONING_EFFORTS.map((effort) => createReasoningEffortOption(effort)),
    ]

    return withCurrentOption(
        currentEffort,
        options,
        (value) => CURATED_CODEX_REASONING_EFFORTS.includes(value as typeof CURATED_CODEX_REASONING_EFFORTS[number]),
        (value) => createReasoningEffortOption(value)
    )
}

export function getClaudeComposerReasoningEffortOptions(
    currentEffort?: ClaudeReasoningEffort | null
): SessionConfigOption<ClaudeReasoningEffort | null>[] {
    const options: SessionConfigOption<ClaudeReasoningEffort | null>[] = [
        createTerminalDefaultReasoningEffortOption(null),
        ...CURATED_CLAUDE_REASONING_EFFORTS.map((effort) => createReasoningEffortOption(effort)),
    ]

    return withCurrentOption(
        currentEffort,
        options,
        (value) => CURATED_CLAUDE_REASONING_EFFORTS.includes(value as typeof CURATED_CLAUDE_REASONING_EFFORTS[number]),
        (value) => createReasoningEffortOption(value)
    )
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
