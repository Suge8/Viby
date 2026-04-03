import type {
    AgentFlavor,
    SessionCollaborationMode,
    SessionModelReasoningEffort,
    SessionPermissionMode,
    TeamSessionSpawnRole
} from '@/api/types'
import type { SessionDriver, SessionHandoffSnapshot } from '@viby/protocol/types'

export interface SpawnSessionOptions {
    machineId?: string
    directory: string
    sessionId?: string
    resumeSessionId?: string
    approvedNewDirectoryCreation?: boolean
    agent?: AgentFlavor
    model?: string
    modelReasoningEffort?: SessionModelReasoningEffort
    permissionMode?: SessionPermissionMode
    sessionRole?: TeamSessionSpawnRole
    collaborationMode?: SessionCollaborationMode
    token?: string
    sessionType?: 'simple' | 'worktree'
    worktreeName?: string
    driverSwitch?: {
        targetDriver: SessionDriver
        handoffSnapshot: SessionHandoffSnapshot
    }
}

export type SpawnSessionResult =
    | { type: 'success'; sessionId: string }
    | { type: 'requestToApproveDirectoryCreation'; directory: string }
    | { type: 'error'; errorMessage: string }
