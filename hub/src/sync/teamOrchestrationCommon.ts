import {
    isTerminalTeamTaskStatus,
    type CodexCollaborationMode,
    type MessageMeta,
    type PermissionMode,
    type Session,
    type TeamMemberIsolationMode,
    type TeamMemberRecord,
    type TeamProjectSnapshot,
    type TeamProviderFlavor,
    type TeamReasoningEffort,
    type TeamTaskRecord
} from '@viby/protocol'
import type { Store } from '../store'
import { TeamCoordinatorService } from './teamCoordinatorService'
import { TeamLifecycleService, type TeamLifecycleActor } from './teamLifecycleService'
import { TeamMemberSessionService } from './teamMemberSessionService'
import { TeamOrchestrationContextReader } from './teamOrchestrationContext'
import {
    TeamOrchestrationError,
    type TeamOrchestrationMemberRole
} from './teamOrchestrationContracts'

export type AppendMessage = (
    sessionId: string,
    payload: {
        text: string
        meta?: MessageMeta
    }
) => Promise<Session>

export type SpawnSession = (options: {
    sessionId?: string
    machineId: string
    directory: string
    agent?: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
    model?: string
    modelReasoningEffort?: TeamReasoningEffort | null
    permissionMode?: PermissionMode
    sessionRole?: 'normal' | 'manager'
    sessionType?: 'simple' | 'worktree'
    worktreeName?: string
    resumeSessionId?: string
    collaborationMode?: CodexCollaborationMode
}) => Promise<{ type: 'success'; sessionId: string } | { type: 'error'; message: string }>

export type GetSession = (sessionId: string) => Session | undefined

export type ResolvedMemberConfig = {
    providerFlavor: TeamProviderFlavor | null
    model: string | null
    reasoningEffort: TeamReasoningEffort | null
    isolationMode: TeamMemberIsolationMode
    requestedWorkspaceRoot: string | null
    initialWorkspaceRoot: string | null
    directory: string
    sessionType: 'simple' | 'worktree'
    worktreeName: string | undefined
}

export type TeamOrchestrationRuntime = {
    store: Store
    coordinator: TeamCoordinatorService
    memberSessionService: TeamMemberSessionService
    lifecycleService: TeamLifecycleService
    contextReader: TeamOrchestrationContextReader
    spawnSession: SpawnSession
    appendInternalUserMessage: AppendMessage
    getSession: GetSession
}

export const DEFAULT_DIRECT_MESSAGE_KIND = 'follow-up'

export function compactSessionIds(values: Array<string | null | undefined>): string[] {
    return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)))
}

export function isTaskTerminal(status: TeamTaskRecord['status']): boolean {
    return isTerminalTeamTaskStatus(status)
}

export function resolveActor(managerSessionId: string): TeamLifecycleActor {
    return {
        actorType: 'manager',
        actorId: managerSessionId
    }
}

export function asMemberRole(role: TeamMemberRecord['role']): TeamOrchestrationMemberRole {
    if (role === 'manager') {
        throw new TeamOrchestrationError(
            'Manager role cannot be used as a managed team member',
            'team_member_role_mismatch',
            409
        )
    }

    return role
}

export function getRequiredProjectSnapshot(
    runtime: TeamOrchestrationRuntime,
    projectId: string
): TeamProjectSnapshot {
    const snapshot = runtime.coordinator.getProjectSnapshot(projectId)
    if (!snapshot) {
        throw new TeamOrchestrationError('Team project not found', 'team_project_not_found', 404)
    }

    return snapshot
}

export function createTeamOrchestrationRuntime(options: {
    store: Store
    coordinator: TeamCoordinatorService
    memberSessionService: TeamMemberSessionService
    lifecycleService: TeamLifecycleService
    spawnSession: SpawnSession
    appendInternalUserMessage: AppendMessage
    getSession: GetSession
}): TeamOrchestrationRuntime {
    return {
        ...options,
        contextReader: new TeamOrchestrationContextReader(options.store)
    }
}

export type { TeamOrchestrationMemberRole } from './teamOrchestrationContracts'
