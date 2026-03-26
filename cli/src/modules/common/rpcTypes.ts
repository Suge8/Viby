import type {
    SessionCollaborationMode,
    SessionModelReasoningEffort,
    SessionPermissionMode,
    TeamSessionSpawnRole
} from '@/api/types'

export interface SpawnSessionOptions {
    machineId?: string
    directory: string
    sessionId?: string
    resumeSessionId?: string
    approvedNewDirectoryCreation?: boolean
    agent?: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
    model?: string
    modelReasoningEffort?: SessionModelReasoningEffort
    permissionMode?: SessionPermissionMode
    sessionRole?: TeamSessionSpawnRole
    collaborationMode?: SessionCollaborationMode
    token?: string
    sessionType?: 'simple' | 'worktree'
    worktreeName?: string
}

export type SpawnSessionResult =
    | { type: 'success'; sessionId: string }
    | { type: 'requestToApproveDirectoryCreation'; directory: string }
    | { type: 'error'; errorMessage: string }
