import {
    CLAUDE_REASONING_EFFORTS,
    type ClaudeReasoningEffort,
    CODEX_MODEL_LABELS,
    COPILOT_MODEL_LABELS,
    type CodexReasoningEffort,
    getClaudeReasoningEffortLabel,
    getCodexReasoningEffortLabel,
    type ModelReasoningEffort,
} from '@viby/protocol'

export { CODEX_MODEL_LABELS, COPILOT_MODEL_LABELS }

export type SessionConfigOption<T extends string | null> = {
    value: T
    label: string
    labelKey?: string
}

export type ModelReasoningEffortSelection = ModelReasoningEffort | 'default'

const TERMINAL_DEFAULT_MODEL_LABEL_KEY = 'model.terminalDefault'
const TERMINAL_DEFAULT_REASONING_EFFORT_LABEL_KEY = 'reasoningEffort.terminalDefault'

export const CURATED_CLAUDE_REASONING_EFFORTS = [...CLAUDE_REASONING_EFFORTS] as const
export const CURATED_CODEX_REASONING_EFFORTS = [
    'low',
    'medium',
    'high',
    'xhigh',
] as const satisfies readonly CodexReasoningEffort[]
export const REASONING_EFFORT_LABEL_KEYS: Record<ModelReasoningEffort, string> = {
    none: 'reasoningEffort.none',
    minimal: 'reasoningEffort.minimal',
    low: 'reasoningEffort.low',
    medium: 'reasoningEffort.medium',
    high: 'reasoningEffort.high',
    xhigh: 'reasoningEffort.xhigh',
    max: 'reasoningEffort.max',
}

export function withCurrentOption<T extends string>(
    currentValue: T | null | undefined,
    options: SessionConfigOption<T | null>[],
    isKnownValue: (value: T) => boolean,
    buildOption: (value: T) => SessionConfigOption<T | null>
): SessionConfigOption<T | null>[] {
    if (!currentValue || isKnownValue(currentValue)) {
        return options
    }

    return [options[0] ?? { value: null, label: '' }, buildOption(currentValue), ...options.slice(1)]
}

export function createTerminalDefaultModelOption<T extends string | null>(value: T): SessionConfigOption<T> {
    return { value, label: 'Terminal default model', labelKey: TERMINAL_DEFAULT_MODEL_LABEL_KEY }
}

export function createTerminalDefaultReasoningEffortOption<T extends ModelReasoningEffortSelection | null>(
    value: T
): SessionConfigOption<T> {
    return { value, label: 'Terminal default reasoning effort', labelKey: TERMINAL_DEFAULT_REASONING_EFFORT_LABEL_KEY }
}

export function createReasoningEffortOption<T extends ModelReasoningEffort | ModelReasoningEffortSelection>(
    value: T
): SessionConfigOption<T> {
    return {
        value,
        label: getReasoningEffortLabel(value as ModelReasoningEffort),
        labelKey: REASONING_EFFORT_LABEL_KEYS[value as ModelReasoningEffort],
    }
}

export function getComposerReasoningEffortOptions<T extends ModelReasoningEffort>(
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

export function normalizeComposerStringValue(value?: string | null): string | null {
    const trimmed = value?.trim()
    if (!trimmed || trimmed === 'auto' || trimmed === 'default') {
        return null
    }

    return trimmed
}

export function getReasoningEffortLabel(effort: ModelReasoningEffort): string {
    if (effort === 'max') {
        return getClaudeReasoningEffortLabel(effort)
    }

    return getCodexReasoningEffortLabel(effort as CodexReasoningEffort)
}
