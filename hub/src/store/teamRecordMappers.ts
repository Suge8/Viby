import type {
    TeamEventRecord,
    TeamMemberRecord,
    TeamProject,
    TeamRoleDefinition,
    TeamTaskRecord
} from '@viby/protocol/types'
import { safeJsonParse } from './json'

export type DbTeamProjectRow = {
    id: string
    manager_session_id: string
    machine_id: string | null
    root_directory: string | null
    title: string
    goal: string | null
    status: TeamProject['status']
    max_active_members: number
    default_isolation_mode: TeamProject['defaultIsolationMode']
    created_at: number
    updated_at: number
    delivered_at: number | null
    archived_at: number | null
}

export type DbTeamMemberRow = {
    id: string
    project_id: string
    session_id: string
    manager_session_id: string
    role: TeamMemberRecord['role']
    role_id: TeamMemberRecord['roleId']
    provider_flavor: TeamMemberRecord['providerFlavor']
    model: string | null
    reasoning_effort: TeamMemberRecord['reasoningEffort']
    isolation_mode: TeamMemberRecord['isolationMode']
    workspace_root: string | null
    control_owner: TeamMemberRecord['controlOwner']
    membership_state: TeamMemberRecord['membershipState']
    revision: number
    supersedes_member_id: string | null
    superseded_by_member_id: string | null
    spawned_for_task_id: string | null
    created_at: number
    updated_at: number
    archived_at: number | null
    removed_at: number | null
}

export type DbTeamRoleRow = {
    project_id: string
    id: TeamRoleDefinition['id']
    source: TeamRoleDefinition['source']
    prototype: TeamRoleDefinition['prototype']
    name: string
    prompt_extension: string | null
    provider_flavor: TeamRoleDefinition['providerFlavor']
    model: string | null
    reasoning_effort: TeamRoleDefinition['reasoningEffort']
    isolation_mode: TeamRoleDefinition['isolationMode']
    created_at: number
    updated_at: number
}

export type DbTeamTaskRow = {
    id: string
    project_id: string
    parent_task_id: string | null
    title: string
    description: string | null
    acceptance_criteria: string | null
    status: TeamTaskRecord['status']
    assignee_member_id: string | null
    reviewer_member_id: string | null
    verifier_member_id: string | null
    priority: string | null
    depends_on: string | null
    retry_count: number
    created_at: number
    updated_at: number
    completed_at: number | null
}

export type DbTeamEventRow = {
    id: string
    project_id: string
    kind: TeamEventRecord['kind']
    actor_type: TeamEventRecord['actorType']
    actor_id: string | null
    target_type: TeamEventRecord['targetType']
    target_id: string | null
    payload: string | null
    created_at: number
}

export function toTeamProject(row: DbTeamProjectRow): TeamProject {
    return {
        id: row.id,
        managerSessionId: row.manager_session_id,
        machineId: row.machine_id,
        rootDirectory: row.root_directory,
        title: row.title,
        goal: row.goal,
        status: row.status,
        maxActiveMembers: row.max_active_members,
        defaultIsolationMode: row.default_isolation_mode,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deliveredAt: row.delivered_at,
        archivedAt: row.archived_at
    }
}

export function toTeamMember(row: DbTeamMemberRow): TeamMemberRecord {
    return {
        id: row.id,
        projectId: row.project_id,
        sessionId: row.session_id,
        managerSessionId: row.manager_session_id,
        role: row.role,
        roleId: row.role_id,
        providerFlavor: row.provider_flavor,
        model: row.model,
        reasoningEffort: row.reasoning_effort,
        isolationMode: row.isolation_mode,
        workspaceRoot: row.workspace_root,
        controlOwner: row.control_owner,
        membershipState: row.membership_state,
        revision: row.revision,
        supersedesMemberId: row.supersedes_member_id,
        supersededByMemberId: row.superseded_by_member_id,
        spawnedForTaskId: row.spawned_for_task_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        archivedAt: row.archived_at,
        removedAt: row.removed_at
    }
}

export function toTeamRole(row: DbTeamRoleRow): TeamRoleDefinition {
    return {
        projectId: row.project_id,
        id: row.id,
        source: row.source,
        prototype: row.prototype,
        name: row.name,
        promptExtension: row.prompt_extension,
        providerFlavor: row.provider_flavor,
        model: row.model,
        reasoningEffort: row.reasoning_effort,
        isolationMode: row.isolation_mode,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

export function toTeamTask(row: DbTeamTaskRow): TeamTaskRecord {
    const dependsOn = safeJsonParse(row.depends_on)
    return {
        id: row.id,
        projectId: row.project_id,
        parentTaskId: row.parent_task_id,
        title: row.title,
        description: row.description,
        acceptanceCriteria: row.acceptance_criteria,
        status: row.status,
        assigneeMemberId: row.assignee_member_id,
        reviewerMemberId: row.reviewer_member_id,
        verifierMemberId: row.verifier_member_id,
        priority: row.priority,
        dependsOn: Array.isArray(dependsOn)
            ? dependsOn.filter((value): value is string => typeof value === 'string')
            : [],
        retryCount: row.retry_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at
    }
}

export function toTeamEvent(row: DbTeamEventRow): TeamEventRecord {
    const payload = safeJsonParse(row.payload)
    return {
        id: row.id,
        projectId: row.project_id,
        kind: row.kind,
        actorType: row.actor_type,
        actorId: row.actor_id,
        targetType: row.target_type,
        targetId: row.target_id,
        payload: payload && typeof payload === 'object' && !Array.isArray(payload)
            ? payload as Record<string, unknown>
            : null,
        createdAt: row.created_at
    }
}

export function resolveManagerTitle(projectTitle: string, metadataJson: string | null): string {
    const metadata = safeJsonParse(metadataJson)
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
        const name = (metadata as Record<string, unknown>).name
        if (typeof name === 'string' && name.length > 0) {
            return name
        }
    }

    return projectTitle
}
