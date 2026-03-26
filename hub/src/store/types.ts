import type {
    CodexCollaborationMode,
    ModelReasoningEffort,
    PermissionMode,
    SessionTeamContext,
    TeamEventRecord,
    TeamMemberRecord,
    TeamProject,
    TeamTaskRecord
} from '@viby/protocol/types'

export type StoredSession = {
    id: string
    tag: string | null
    machineId: string | null
    createdAt: number
    updatedAt: number
    metadata: unknown | null
    metadataVersion: number
    agentState: unknown | null
    agentStateVersion: number
    model: string | null
    modelReasoningEffort: ModelReasoningEffort | null
    permissionMode: PermissionMode | null
    collaborationMode: CodexCollaborationMode | null
    todos: unknown | null
    todosUpdatedAt: number | null
    teamState: unknown | null
    teamStateUpdatedAt: number | null
    active: boolean
    activeAt: number | null
    seq: number
}

export type StoredMachine = {
    id: string
    createdAt: number
    updatedAt: number
    metadata: unknown | null
    metadataVersion: number
    runnerState: unknown | null
    runnerStateVersion: number
    active: boolean
    activeAt: number | null
    seq: number
}

export type StoredMessage = {
    id: string
    sessionId: string
    content: unknown
    createdAt: number
    seq: number
    localId: string | null
}

export type StoredPushSubscription = {
    id: number
    endpoint: string
    p256dh: string
    auth: string
    createdAt: number
}

export type StoredTeamProject = TeamProject
export type StoredTeamMember = TeamMemberRecord
export type StoredTeamTask = TeamTaskRecord
export type StoredTeamEvent = TeamEventRecord
export type StoredSessionTeamContext = SessionTeamContext

export type VersionedUpdateResult<T> =
    | { result: 'success'; version: number; value: T }
    | { result: 'version-mismatch'; version: number; value: T }
    | { result: 'error' }
