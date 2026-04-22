import type { AgentFlavor, ModelReasoningEffort } from '@viby/protocol'

export type AgentType = AgentFlavor
export type SessionType = 'simple' | 'worktree'
export type ModelReasoningEffortSelection = ModelReasoningEffort | 'default'
