import type {
    CodexCollaborationMode,
    PermissionMode,
    Session,
    TeamMemberIsolationMode,
    TeamMemberRecord,
    TeamProject,
    TeamProjectPreset,
    TeamProjectSnapshot,
    TeamProviderFlavor,
    TeamReasoningEffort,
    TeamRoleDefinition,
    TeamRolePrototype,
    TeamTaskRecord,
} from '@viby/protocol/types'

export type TeamOrchestrationMemberRole = Exclude<TeamRolePrototype, 'manager'>
export type TeamOrchestrationMessageKind = 'task-assign' | 'follow-up' | 'coordination'
export type MutableTeamTaskStatus = Exclude<TeamTaskRecord['status'], 'in_review' | 'in_verification' | 'done'>

export class TeamOrchestrationError extends Error {
    readonly code: string
    readonly status: 400 | 404 | 409

    constructor(message: string, code: string, status: 400 | 404 | 409) {
        super(message)
        this.name = 'TeamOrchestrationError'
        this.code = code
        this.status = status
    }
}

export type SpawnTeamMemberInput = {
    managerSessionId: string
    roleId: TeamRoleDefinition['id']
    providerFlavor?: TeamProviderFlavor | null
    model?: string | null
    reasoningEffort?: TeamReasoningEffort | null
    isolationMode?: TeamMemberIsolationMode
    taskId?: string | null
    instruction?: string | null
    contextTrusted?: boolean
    workspaceTrusted?: boolean
    requireFreshPerspective?: boolean
    permissionMode?: PermissionMode
    collaborationMode?: CodexCollaborationMode
    taskGoal?: string | null
    artifactSummary?: string | null
    attemptSummary?: string | null
    failureSummary?: string | null
    reviewSummary?: string | null
    filePointers?: string[]
}

export type UpdateTeamMemberInput =
    | {
        managerSessionId: string
        memberId: string
        action: 'remove'
    }
    | ({
        managerSessionId: string
        memberId: string
        action: 'replace'
    } & Omit<SpawnTeamMemberInput, 'managerSessionId' | 'roleId'>)

export type CreateTeamRoleInput = {
    managerSessionId: string
    projectId: string
    roleId: TeamRoleDefinition['id']
    prototype: TeamOrchestrationMemberRole
    name: string
    promptExtension?: string | null
    providerFlavor?: TeamProviderFlavor
    model?: string | null
    reasoningEffort?: TeamReasoningEffort | null
    isolationMode?: TeamMemberIsolationMode
}

export type UpdateTeamRoleInput = {
    managerSessionId: string
    projectId: string
    roleId: TeamRoleDefinition['id']
    name?: string
    promptExtension?: string | null
    providerFlavor?: TeamProviderFlavor
    model?: string | null
    reasoningEffort?: TeamReasoningEffort | null
    isolationMode?: TeamMemberIsolationMode
}

export type DeleteTeamRoleInput = {
    managerSessionId: string
    projectId: string
    roleId: TeamRoleDefinition['id']
}

export type CreateTeamTaskInput = {
    managerSessionId: string
    title: string
    description?: string | null
    acceptanceCriteria?: string | null
    parentTaskId?: string | null
    status?: MutableTeamTaskStatus
    assigneeMemberId?: string | null
    reviewerMemberId?: string | null
    verifierMemberId?: string | null
    priority?: string | null
    dependsOn?: string[]
    note?: string | null
}

export type UpdateTeamTaskInput = {
    managerSessionId: string
    taskId: string
    title?: string
    description?: string | null
    acceptanceCriteria?: string | null
    status?: MutableTeamTaskStatus
    assigneeMemberId?: string | null
    reviewerMemberId?: string | null
    verifierMemberId?: string | null
    priority?: string | null
    dependsOn?: string[]
    note?: string | null
}

export type MessageTeamMemberInput = {
    managerSessionId: string
    memberId: string
    text: string
    kind?: TeamOrchestrationMessageKind
}

export type CloseTeamProjectInput = {
    managerSessionId: string
    projectId: string
    summary?: string | null
}

export type UpdateTeamProjectSettingsInput = {
    managerSessionId: string
    projectId: string
    maxActiveMembers: number
    defaultIsolationMode: TeamProject['defaultIsolationMode']
}


export type ExportTeamProjectPresetInput = {
    managerSessionId: string
    projectId: string
}

export type ImportTeamProjectPresetInput = {
    managerSessionId: string
    projectId: string
    preset: TeamProjectPreset
}

export type TeamMemberLaunchSummary = {
    strategy: 'spawn' | 'resume' | 'revision'
    reason: string
    previousMemberId: string | null
}

export type TeamMemberActionResult = {
    member: TeamMemberRecord
    snapshot: TeamProjectSnapshot
    session: Session
    launch: TeamMemberLaunchSummary
}

export type TeamMemberUpdateResult =
    | {
        action: 'remove'
        member: TeamMemberRecord
        snapshot: TeamProjectSnapshot
    }
    | {
        action: 'replace'
        member: TeamMemberRecord
        snapshot: TeamProjectSnapshot
        session: Session
        launch: TeamMemberLaunchSummary
        replacedMemberId: string
    }

export type TeamRoleActionResult = {
    role: TeamRoleDefinition
    snapshot: TeamProjectSnapshot
}

export type TeamRoleDeleteResult = {
    roleId: TeamRoleDefinition['id']
    snapshot: TeamProjectSnapshot
}

export type TeamTaskActionResult = {
    task: TeamTaskRecord
    snapshot: TeamProjectSnapshot
}

export type TeamProjectActionResult = {
    project: TeamProject
    snapshot: TeamProjectSnapshot
}
