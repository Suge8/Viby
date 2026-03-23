import type { ModelReasoningEffort } from '@viby/protocol'

export type AgentType = 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
export type SessionType = 'simple' | 'worktree'
export type ModelReasoningEffortSelection = ModelReasoningEffort | 'default'
