export const CLAUDE_PERMISSION_MODES = ['default', 'acceptEdits', 'bypassPermissions', 'plan'] as const
export type ClaudePermissionMode = (typeof CLAUDE_PERMISSION_MODES)[number]

export const CODEX_PERMISSION_MODES = ['default', 'read-only', 'safe-yolo', 'yolo'] as const
export type CodexPermissionMode = (typeof CODEX_PERMISSION_MODES)[number]

export const CODEX_COLLABORATION_MODES = ['default', 'plan'] as const
export type CodexCollaborationMode = (typeof CODEX_COLLABORATION_MODES)[number]

export const CODEX_REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
export type CodexReasoningEffort = (typeof CODEX_REASONING_EFFORTS)[number]

export const CLAUDE_REASONING_EFFORTS = ['low', 'medium', 'high', 'max'] as const
export type ClaudeReasoningEffort = (typeof CLAUDE_REASONING_EFFORTS)[number]

export const PI_REASONING_EFFORTS = CODEX_REASONING_EFFORTS
export type PiReasoningEffort = (typeof PI_REASONING_EFFORTS)[number]

export const MODEL_REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export type ModelReasoningEffort = (typeof MODEL_REASONING_EFFORTS)[number]

export const GEMINI_PERMISSION_MODES = ['default', 'read-only', 'safe-yolo', 'yolo'] as const
export type GeminiPermissionMode = (typeof GEMINI_PERMISSION_MODES)[number]

export const PI_PERMISSION_MODES = ['default', 'read-only', 'safe-yolo', 'yolo'] as const
export type PiPermissionMode = (typeof PI_PERMISSION_MODES)[number]

export const OPENCODE_PERMISSION_MODES = ['default', 'yolo'] as const
export type OpencodePermissionMode = (typeof OPENCODE_PERMISSION_MODES)[number]

export const CURSOR_PERMISSION_MODES = ['default', 'plan', 'ask', 'yolo'] as const
export type CursorPermissionMode = (typeof CURSOR_PERMISSION_MODES)[number]

export const COPILOT_PERMISSION_MODES = ['default', 'acceptEdits', 'bypassPermissions'] as const
export type CopilotPermissionMode = (typeof COPILOT_PERMISSION_MODES)[number]

export const PERMISSION_MODES = [
    'default',
    'acceptEdits',
    'bypassPermissions',
    'plan',
    'ask',
    'read-only',
    'safe-yolo',
    'yolo',
] as const
export type PermissionMode = (typeof PERMISSION_MODES)[number]

export const CLAUDE_MODEL_PRESETS = ['sonnet', 'sonnet[1m]', 'opus', 'opus[1m]'] as const
export type ClaudeModelPreset = (typeof CLAUDE_MODEL_PRESETS)[number]

export const CLAUDE_SELECTABLE_MODEL_PRESETS = ['sonnet', 'opus'] as const
export type ClaudeSelectableModelPreset = (typeof CLAUDE_SELECTABLE_MODEL_PRESETS)[number]

export const CODEX_MODEL_PRESETS = ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.2'] as const
export type CodexModelPreset = (typeof CODEX_MODEL_PRESETS)[number]

export const GEMINI_MODEL_PRESETS = [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-3-pro-preview',
    'gemini-3-flash-preview',
] as const
export type GeminiModelPreset = (typeof GEMINI_MODEL_PRESETS)[number]

export const COPILOT_MODEL_PRESETS = [
    'gpt-5',
    'gpt-5.4',
    'gpt-5.4-mini',
    'claude-sonnet-4.6',
    'claude-sonnet-4.5',
    'gemini-2.5-pro',
] as const
export type CopilotModelPreset = (typeof COPILOT_MODEL_PRESETS)[number]

export const AGENT_FLAVORS = ['claude', 'codex', 'gemini', 'opencode', 'cursor', 'pi', 'copilot'] as const
export type AgentFlavor = (typeof AGENT_FLAVORS)[number]

export const LIVE_MODEL_SELECTION_DRIVERS = ['claude', 'codex', 'gemini', 'pi', 'copilot'] as const
export const LIVE_MODEL_REASONING_EFFORT_DRIVERS = ['claude', 'codex', 'pi'] as const

export const PERMISSION_MODE_LABELS: Record<PermissionMode, string> = {
    default: 'Default',
    acceptEdits: 'Accept Edits',
    plan: 'Plan Mode',
    ask: 'Ask Mode',
    bypassPermissions: 'Yolo',
    'read-only': 'Read Only',
    'safe-yolo': 'Safe Yolo',
    yolo: 'Yolo',
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
    yolo: 'danger',
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
    'opus[1m]': 'Opus',
}

export const GEMINI_MODEL_LABELS: Record<GeminiModelPreset, string> = {
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
    'gemini-3-pro-preview': 'Gemini 3 Pro Preview',
    'gemini-3-flash-preview': 'Gemini 3 Flash Preview',
}

export const CODEX_COLLABORATION_MODE_LABELS: Record<CodexCollaborationMode, string> = {
    default: 'Default',
    plan: 'Plan',
}

export const CODEX_REASONING_EFFORT_LABELS: Record<CodexReasoningEffort, string> = {
    none: 'None',
    minimal: 'Minimal',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    xhigh: 'XHigh',
}

export const CLAUDE_REASONING_EFFORT_LABELS: Record<ClaudeReasoningEffort, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    max: 'Max',
}
