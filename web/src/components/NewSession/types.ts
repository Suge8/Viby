import type { AgentFlavor, CodexServiceTier, ModelReasoningEffort } from '@viby/protocol'

export type AgentType = AgentFlavor
export type SessionType = 'simple' | 'worktree'
export type ModelReasoningEffortSelection = ModelReasoningEffort | null
export type CodexServiceTierSelection = CodexServiceTier
