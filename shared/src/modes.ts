export {
    AGENT_FLAVORS,
    type AgentFlavor,
    CLAUDE_MODEL_LABELS,
    CLAUDE_MODEL_PRESETS,
    CLAUDE_PERMISSION_MODES,
    CLAUDE_REASONING_EFFORT_LABELS,
    CLAUDE_REASONING_EFFORTS,
    CLAUDE_SELECTABLE_MODEL_PRESETS,
    type ClaudeModelPreset,
    type ClaudePermissionMode,
    type ClaudeReasoningEffort,
    type ClaudeReasoningEffortOption,
    type ClaudeSelectableModelPreset,
    CODEX_COLLABORATION_MODE_LABELS,
    CODEX_COLLABORATION_MODES,
    CODEX_MODEL_PRESETS,
    CODEX_PERMISSION_MODES,
    CODEX_REASONING_EFFORT_LABELS,
    CODEX_REASONING_EFFORTS,
    COPILOT_MODEL_PRESETS,
    COPILOT_PERMISSION_MODES,
    type CodexCollaborationMode,
    type CodexCollaborationModeOption,
    type CodexModelPreset,
    type CodexPermissionMode,
    type CodexReasoningEffort,
    type CodexReasoningEffortOption,
    type CopilotModelPreset,
    type CopilotPermissionMode,
    CURSOR_PERMISSION_MODES,
    type CursorPermissionMode,
    GEMINI_MODEL_LABELS,
    GEMINI_MODEL_PRESETS,
    GEMINI_PERMISSION_MODES,
    type GeminiModelPreset,
    type GeminiPermissionMode,
    LIVE_MODEL_REASONING_EFFORT_DRIVERS,
    LIVE_MODEL_SELECTION_DRIVERS,
    MODEL_REASONING_EFFORTS,
    type ModelReasoningEffort,
    OPENCODE_PERMISSION_MODES,
    type OpencodePermissionMode,
    PERMISSION_MODE_LABELS,
    PERMISSION_MODE_TONES,
    PERMISSION_MODES,
    type PermissionMode,
    type PermissionModeOption,
    type PermissionModeTone,
    PI_PERMISSION_MODES,
    PI_REASONING_EFFORTS,
    type PiPermissionMode,
    type PiReasoningEffort,
} from './modeCatalog'

import {
    CLAUDE_MODEL_LABELS,
    CLAUDE_MODEL_PRESETS,
    CLAUDE_PERMISSION_MODES,
    CLAUDE_REASONING_EFFORT_LABELS,
    CLAUDE_REASONING_EFFORTS,
    CLAUDE_SELECTABLE_MODEL_PRESETS,
    type ClaudeModelPreset,
    type ClaudeReasoningEffort,
    type ClaudeReasoningEffortOption,
    CODEX_COLLABORATION_MODE_LABELS,
    CODEX_COLLABORATION_MODES,
    CODEX_MODEL_PRESETS,
    CODEX_PERMISSION_MODES,
    CODEX_REASONING_EFFORT_LABELS,
    CODEX_REASONING_EFFORTS,
    COPILOT_MODEL_PRESETS,
    COPILOT_PERMISSION_MODES,
    type CodexCollaborationMode,
    type CodexCollaborationModeOption,
    type CodexReasoningEffort,
    type CodexReasoningEffortOption,
    CURSOR_PERMISSION_MODES,
    GEMINI_MODEL_LABELS,
    GEMINI_MODEL_PRESETS,
    GEMINI_PERMISSION_MODES,
    LIVE_MODEL_REASONING_EFFORT_DRIVERS,
    LIVE_MODEL_SELECTION_DRIVERS,
    MODEL_REASONING_EFFORTS,
    type ModelReasoningEffort,
    OPENCODE_PERMISSION_MODES,
    PERMISSION_MODE_LABELS,
    PERMISSION_MODE_TONES,
    PERMISSION_MODES,
    type PermissionMode,
    type PermissionModeOption,
    type PermissionModeTone,
    PI_PERMISSION_MODES,
    PI_REASONING_EFFORTS,
} from './modeCatalog'

export function isClaudeModelPreset(model: string | null | undefined): model is ClaudeModelPreset {
    return typeof model === 'string' && CLAUDE_MODEL_PRESETS.includes(model as ClaudeModelPreset)
}

export function getClaudeModelLabel(model: string): string | null {
    const trimmedModel = model.trim()
    return trimmedModel ? (CLAUDE_MODEL_LABELS[trimmedModel as ClaudeModelPreset] ?? null) : null
}

export function getGeminiModelLabel(model: string): string | null {
    const trimmedModel = model.trim()
    return trimmedModel ? (GEMINI_MODEL_LABELS[trimmedModel as keyof typeof GEMINI_MODEL_LABELS] ?? null) : null
}

export function getPermissionModeLabel(mode: PermissionMode): string {
    return PERMISSION_MODE_LABELS[mode]
}

export function getPermissionModeTone(mode: PermissionMode): PermissionModeTone {
    return PERMISSION_MODE_TONES[mode]
}

export function getCodexCollaborationModeLabel(mode: CodexCollaborationMode): string {
    return CODEX_COLLABORATION_MODE_LABELS[mode]
}

export function getCodexReasoningEffortLabel(effort: CodexReasoningEffort): string {
    return CODEX_REASONING_EFFORT_LABELS[effort]
}

export function getClaudeReasoningEffortLabel(effort: ClaudeReasoningEffort): string {
    return CLAUDE_REASONING_EFFORT_LABELS[effort]
}

export function getPermissionModesForDriver(driver?: string | null): readonly PermissionMode[] {
    if (driver === 'codex') return CODEX_PERMISSION_MODES
    if (driver === 'gemini') return GEMINI_PERMISSION_MODES
    if (driver === 'pi') return PI_PERMISSION_MODES
    if (driver === 'opencode') return OPENCODE_PERMISSION_MODES
    if (driver === 'cursor') return CURSOR_PERMISSION_MODES
    if (driver === 'copilot') return COPILOT_PERMISSION_MODES
    return CLAUDE_PERMISSION_MODES
}

export function getModelReasoningEffortsForDriver(driver?: string | null): readonly ModelReasoningEffort[] {
    if (driver === 'codex') return CODEX_REASONING_EFFORTS
    if (driver === 'claude') return CLAUDE_REASONING_EFFORTS
    if (driver === 'pi') return PI_REASONING_EFFORTS
    return []
}

export function supportsLiveModelSelectionForDriver(driver?: string | null): boolean {
    return LIVE_MODEL_SELECTION_DRIVERS.includes(driver as (typeof LIVE_MODEL_SELECTION_DRIVERS)[number])
}

export function supportsLiveModelReasoningEffortForDriver(driver?: string | null): boolean {
    return LIVE_MODEL_REASONING_EFFORT_DRIVERS.includes(driver as (typeof LIVE_MODEL_REASONING_EFFORT_DRIVERS)[number])
}

export function supportsDriverSwitchModelCarryover(driver?: string | null): boolean {
    return driver === 'cursor' || supportsLiveModelSelectionForDriver(driver)
}

export function getSelectableModelPresetsForDriver(driver?: string | null): readonly string[] {
    if (driver === 'claude') return CLAUDE_SELECTABLE_MODEL_PRESETS
    if (driver === 'codex') return CODEX_MODEL_PRESETS
    if (driver === 'gemini') return GEMINI_MODEL_PRESETS
    if (driver === 'copilot') return COPILOT_MODEL_PRESETS
    return []
}

export function isSelectableModelPresetForDriver(model: string, driver?: string | null): boolean {
    const trimmedModel = model.trim()
    return Boolean(trimmedModel) && getSelectableModelPresetsForDriver(driver).includes(trimmedModel)
}

export function isDriverSwitchCompatibleModelPresetForDriver(model: string, driver?: string | null): boolean {
    const trimmedModel = model.trim()
    if (!trimmedModel || !supportsDriverSwitchModelCarryover(driver)) {
        return false
    }
    return driver === 'cursor' ? true : isSelectableModelPresetForDriver(trimmedModel, driver)
}

export function getPermissionModeOptionsForDriver(driver?: string | null): PermissionModeOption[] {
    return getPermissionModesForDriver(driver).map((mode) => ({
        mode,
        label: getPermissionModeLabel(mode),
        tone: getPermissionModeTone(mode),
    }))
}

export function isPermissionModeAllowedForDriver(mode: PermissionMode, driver?: string | null): boolean {
    return getPermissionModesForDriver(driver).includes(mode)
}

export function isModelReasoningEffortAllowedForDriver(effort: ModelReasoningEffort, driver?: string | null): boolean {
    return getModelReasoningEffortsForDriver(driver).includes(effort)
}

export function getCodexCollaborationModeOptions(): CodexCollaborationModeOption[] {
    return CODEX_COLLABORATION_MODES.map((mode) => ({ mode, label: getCodexCollaborationModeLabel(mode) }))
}

export function getCodexReasoningEffortOptions(): CodexReasoningEffortOption[] {
    return CODEX_REASONING_EFFORTS.map((effort) => ({ effort, label: getCodexReasoningEffortLabel(effort) }))
}

export function getClaudeReasoningEffortOptions(): ClaudeReasoningEffortOption[] {
    return CLAUDE_REASONING_EFFORTS.map((effort) => ({ effort, label: getClaudeReasoningEffortLabel(effort) }))
}
