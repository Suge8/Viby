import type { AgentFlavor, ModelReasoningEffort, TeamSessionSpawnRole } from '@viby/protocol'

export type AgentType = AgentFlavor
export type SessionType = 'simple' | 'worktree'
export type SessionRole = TeamSessionSpawnRole
export type ModelReasoningEffortSelection = ModelReasoningEffort | 'default'
