import {
    type AgentModelCapability,
    type ClaudeReasoningEffort,
    type CodexReasoningEffort,
    getClaudeModelLabel,
    getGeminiModelLabel,
    type ModelReasoningEffort,
} from '@viby/protocol'
import { findAgentModelCapability, normalizeAgentModelCapabilities } from '@/lib/sessionConfigAgentSupport'
import {
    CODEX_MODEL_LABELS,
    COPILOT_MODEL_LABELS,
    CURATED_CLAUDE_REASONING_EFFORTS,
    CURATED_CODEX_REASONING_EFFORTS,
    createReasoningEffortOption,
    createTerminalDefaultModelOption,
    createTerminalDefaultReasoningEffortOption,
    getComposerReasoningEffortOptions,
    type ModelReasoningEffortSelection,
    normalizeComposerStringValue,
    type SessionConfigOption,
    withCurrentOption,
} from '@/lib/sessionConfigOptionSupport'

export type { ModelReasoningEffortSelection, SessionConfigOption } from '@/lib/sessionConfigOptionSupport'
export { findAgentModelCapability }

export function getSessionModelDisplayLabel(model: string, sessionDriver?: string | null): string {
    return getSessionModelDisplayLabelWithCapabilities(model, sessionDriver)
}

export function getSessionModelDisplayLabelWithCapabilities(
    model: string,
    sessionDriver?: string | null,
    modelCapabilities?: readonly AgentModelCapability[] | null
): string {
    const normalizedModel = model.trim()
    if (!normalizedModel) {
        return model
    }

    if (sessionDriver === 'pi') {
        return modelCapabilities?.find((capability) => capability.id === normalizedModel)?.label ?? normalizedModel
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

export function getPiComposerModelOptions(
    currentModel?: string | null,
    capabilities?: readonly AgentModelCapability[] | null
): SessionConfigOption<string | null>[] {
    const normalizedCapabilities = normalizeAgentModelCapabilities(capabilities)
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
