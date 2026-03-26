export const CLAUDE_PERMISSION_MODES = ['default', 'acceptEdits', 'bypassPermissions', 'plan'] as const
export type ClaudePermissionMode = typeof CLAUDE_PERMISSION_MODES[number]

export const CODEX_PERMISSION_MODES = ['default', 'read-only', 'safe-yolo', 'yolo'] as const
export type CodexPermissionMode = typeof CODEX_PERMISSION_MODES[number]

export const CODEX_COLLABORATION_MODES = ['default', 'plan'] as const
export type CodexCollaborationMode = typeof CODEX_COLLABORATION_MODES[number]

export const CODEX_REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
export type CodexReasoningEffort = typeof CODEX_REASONING_EFFORTS[number]

export const CLAUDE_REASONING_EFFORTS = ['low', 'medium', 'high', 'max'] as const
export type ClaudeReasoningEffort = typeof CLAUDE_REASONING_EFFORTS[number]

export const MODEL_REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export type ModelReasoningEffort = typeof MODEL_REASONING_EFFORTS[number]

export const GEMINI_PERMISSION_MODES = ['default', 'read-only', 'safe-yolo', 'yolo'] as const
export type GeminiPermissionMode = typeof GEMINI_PERMISSION_MODES[number]

export const OPENCODE_PERMISSION_MODES = ['default', 'yolo'] as const
export type OpencodePermissionMode = typeof OPENCODE_PERMISSION_MODES[number]

export const CURSOR_PERMISSION_MODES = ['default', 'plan', 'ask', 'yolo'] as const
export type CursorPermissionMode = typeof CURSOR_PERMISSION_MODES[number]

export const PERMISSION_MODES = [
    'default',
    'acceptEdits',
    'bypassPermissions',
    'plan',
    'ask',
    'read-only',
    'safe-yolo',
    'yolo'
] as const
export type PermissionMode = typeof PERMISSION_MODES[number]

export const CLAUDE_MODEL_PRESETS = ['sonnet', 'sonnet[1m]', 'opus', 'opus[1m]'] as const
export type ClaudeModelPreset = typeof CLAUDE_MODEL_PRESETS[number]

export const CLAUDE_SELECTABLE_MODEL_PRESETS = ['sonnet', 'opus'] as const
export type ClaudeSelectableModelPreset = typeof CLAUDE_SELECTABLE_MODEL_PRESETS[number]

export const GEMINI_MODEL_PRESETS = [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-3-pro-preview',
    'gemini-3-flash-preview'
] as const
export type GeminiModelPreset = typeof GEMINI_MODEL_PRESETS[number]

export const AGENT_FLAVORS = ['claude', 'codex', 'gemini', 'opencode', 'cursor'] as const
export type AgentFlavor = typeof AGENT_FLAVORS[number]

const LIVE_MODEL_SELECTION_FLAVORS = ['claude', 'codex', 'gemini'] as const
const LIVE_MODEL_REASONING_EFFORT_FLAVORS = ['claude', 'codex'] as const

export const PERMISSION_MODE_LABELS: Record<PermissionMode, string> = {
    default: 'Default',
    acceptEdits: 'Accept Edits',
    plan: 'Plan Mode',
    ask: 'Ask Mode',
    bypassPermissions: 'Yolo',
    'read-only': 'Read Only',
    'safe-yolo': 'Safe Yolo',
    yolo: 'Yolo'
}

export type PermissionModeTone = 'neutral' | 'info' | 'warning' | 'danger'

export const PERMISSION_MODE_TONES: Record<PermissionMode, PermissionModeTone> = {
    default: 'neutral',
    acceptEdits: 'warning',
    plan: 'info',
    ask: 'info',
    bypassPermissions: 'danger',
    'read-only': 'warning',
    'safe-yolo': 'warning',
    yolo: 'danger'
}

export type PermissionModeOption = {
    mode: PermissionMode
    label: string
    tone: PermissionModeTone
}

export type CodexCollaborationModeOption = {
    mode: CodexCollaborationMode
    label: string
}

export type CodexReasoningEffortOption = {
    effort: CodexReasoningEffort
    label: string
}

export type ClaudeReasoningEffortOption = {
    effort: ClaudeReasoningEffort
    label: string
}

export const CLAUDE_MODEL_LABELS: Record<ClaudeModelPreset, string> = {
    sonnet: 'Sonnet',
    'sonnet[1m]': 'Sonnet',
    opus: 'Opus',
    'opus[1m]': 'Opus'
}

export const GEMINI_MODEL_LABELS: Record<GeminiModelPreset, string> = {
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
    'gemini-3-pro-preview': 'Gemini 3 Pro Preview',
    'gemini-3-flash-preview': 'Gemini 3 Flash Preview'
}

export const CODEX_COLLABORATION_MODE_LABELS: Record<CodexCollaborationMode, string> = {
    default: 'Default',
    plan: 'Plan'
}

export const CODEX_REASONING_EFFORT_LABELS: Record<CodexReasoningEffort, string> = {
    none: 'None',
    minimal: 'Minimal',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    xhigh: 'XHigh'
}

export const CLAUDE_REASONING_EFFORT_LABELS: Record<ClaudeReasoningEffort, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    max: 'Max'
}

export function isClaudeModelPreset(model: string | null | undefined): model is ClaudeModelPreset {
    return typeof model === 'string' && CLAUDE_MODEL_PRESETS.includes(model as ClaudeModelPreset)
}

export function getClaudeModelLabel(model: string): string | null {
    const trimmedModel = model.trim()
    if (!trimmedModel) {
        return null
    }

    return CLAUDE_MODEL_LABELS[trimmedModel as ClaudeModelPreset] ?? null
}

export function getGeminiModelLabel(model: string): string | null {
    const trimmedModel = model.trim()
    if (!trimmedModel) {
        return null
    }

    return GEMINI_MODEL_LABELS[trimmedModel as GeminiModelPreset] ?? null
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

export function getPermissionModesForFlavor(flavor?: string | null): readonly PermissionMode[] {
    if (flavor === 'codex') {
        return CODEX_PERMISSION_MODES
    }
    if (flavor === 'gemini') {
        return GEMINI_PERMISSION_MODES
    }
    if (flavor === 'opencode') {
        return OPENCODE_PERMISSION_MODES
    }
    if (flavor === 'cursor') {
        return CURSOR_PERMISSION_MODES
    }
    return CLAUDE_PERMISSION_MODES
}

export function getModelReasoningEffortsForFlavor(flavor?: string | null): readonly ModelReasoningEffort[] {
    if (flavor === 'codex') {
        return CODEX_REASONING_EFFORTS
    }
    if (flavor === 'claude') {
        return CLAUDE_REASONING_EFFORTS
    }

    return []
}

export function supportsLiveModelSelectionForFlavor(flavor?: string | null): boolean {
    return LIVE_MODEL_SELECTION_FLAVORS.includes(flavor as typeof LIVE_MODEL_SELECTION_FLAVORS[number])
}

export function supportsLiveModelReasoningEffortForFlavor(flavor?: string | null): boolean {
    return LIVE_MODEL_REASONING_EFFORT_FLAVORS.includes(flavor as typeof LIVE_MODEL_REASONING_EFFORT_FLAVORS[number])
}

export function getPermissionModeOptionsForFlavor(flavor?: string | null): PermissionModeOption[] {
    return getPermissionModesForFlavor(flavor).map((mode) => ({
        mode,
        label: getPermissionModeLabel(mode),
        tone: getPermissionModeTone(mode)
    }))
}

export function isPermissionModeAllowedForFlavor(mode: PermissionMode, flavor?: string | null): boolean {
    return getPermissionModesForFlavor(flavor).includes(mode)
}

export function isModelReasoningEffortAllowedForFlavor(
    effort: ModelReasoningEffort,
    flavor?: string | null
): boolean {
    return getModelReasoningEffortsForFlavor(flavor).includes(effort)
}

export function getCodexCollaborationModeOptions(): CodexCollaborationModeOption[] {
    return CODEX_COLLABORATION_MODES.map((mode) => ({
        mode,
        label: getCodexCollaborationModeLabel(mode)
    }))
}

export function getCodexReasoningEffortOptions(): CodexReasoningEffortOption[] {
    return CODEX_REASONING_EFFORTS.map((effort) => ({
        effort,
        label: getCodexReasoningEffortLabel(effort)
    }))
}

export function getClaudeReasoningEffortOptions(): ClaudeReasoningEffortOption[] {
    return CLAUDE_REASONING_EFFORTS.map((effort) => ({
        effort,
        label: getClaudeReasoningEffortLabel(effort)
    }))
}
