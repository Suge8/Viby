import type { AgentFlavor, CodexServiceTier, ModelReasoningEffort } from '@viby/protocol'

export type AgentType = AgentFlavor
export type SessionType = 'simple' | 'worktree'
export type ModelReasoningEffortSelection = ModelReasoningEffort | 'default'
export type CodexServiceTierSelection = CodexServiceTier
