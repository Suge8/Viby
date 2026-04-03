import type { Database } from 'bun:sqlite'
import { TEAM_ACCEPTANCE_EVENT_KINDS } from '@viby/protocol'
import type {
    TeamEventRecord,
    TeamMemberRecord,
    TeamTaskRecord,
} from '@viby/protocol/types'
import {
    type DbTeamEventRow,
    type DbTeamMemberRow,
    type DbTeamTaskRow,
    toTeamEvent,
    toTeamMember,
    toTeamTask,
} from './teamRecordMappers'

export {
    deleteTeamProject,
    deleteTeamRole,
    getTeamProject,
    getTeamProjectByManagerSessionId,
    getTeamRole,
    listTeamRolesByProjectId,
    upsertTeamProject,
    upsertTeamRole,
} from './teamProjectRoleStore'
export { getSessionTeamContext } from './teamSessionContext'

const ACCEPTANCE_EVENT_KIND_SQL_PLACEHOLDERS = TEAM_ACCEPTANCE_EVENT_KINDS
    .map(() => '?')
    .join(', ')

export function getTeamMemberBySessionId(db: Database, sessionId: string): TeamMemberRecord | null {
    const row = db.query('SELECT * FROM team_members WHERE session_id = ? LIMIT 1').get(sessionId) as DbTeamMemberRow | undefined
    return row ? toTeamMember(row) : null
}

export function getTeamMember(db: Database, memberId: string): TeamMemberRecord | null {
    const row = db.query('SELECT * FROM team_members WHERE id = ? LIMIT 1').get(memberId) as DbTeamMemberRow | undefined
    return row ? toTeamMember(row) : null
}

export function getTeamTask(db: Database, taskId: string): TeamTaskRecord | null {
    const row = db.query('SELECT * FROM team_tasks WHERE id = ? LIMIT 1').get(taskId) as DbTeamTaskRow | undefined
    return row ? toTeamTask(row) : null
}

export function upsertTeamMember(db: Database, member: TeamMemberRecord): TeamMemberRecord {
    db.query(`
        INSERT INTO team_members (
            id, project_id, session_id, manager_session_id, role, role_id, provider_flavor, model, reasoning_effort,
            isolation_mode, workspace_root, control_owner, membership_state, revision,
            supersedes_member_id, superseded_by_member_id, spawned_for_task_id,
            created_at, updated_at, archived_at, removed_at
        ) VALUES (
            @id, @project_id, @session_id, @manager_session_id, @role, @role_id, @provider_flavor, @model, @reasoning_effort,
            @isolation_mode, @workspace_root, @control_owner, @membership_state, @revision,
            @supersedes_member_id, @superseded_by_member_id, @spawned_for_task_id,
            @created_at, @updated_at, @archived_at, @removed_at
        )
        ON CONFLICT(id) DO UPDATE SET
            project_id = excluded.project_id,
            session_id = excluded.session_id,
            manager_session_id = excluded.manager_session_id,
            role = excluded.role,
            role_id = excluded.role_id,
            provider_flavor = excluded.provider_flavor,
            model = excluded.model,
            reasoning_effort = excluded.reasoning_effort,
            isolation_mode = excluded.isolation_mode,
            workspace_root = excluded.workspace_root,
            control_owner = excluded.control_owner,
            membership_state = excluded.membership_state,
            revision = excluded.revision,
            supersedes_member_id = excluded.supersedes_member_id,
            superseded_by_member_id = excluded.superseded_by_member_id,
            spawned_for_task_id = excluded.spawned_for_task_id,
            updated_at = excluded.updated_at,
            archived_at = excluded.archived_at,
            removed_at = excluded.removed_at
    `).run({
        id: member.id,
        project_id: member.projectId,
        session_id: member.sessionId,
        manager_session_id: member.managerSessionId,
        role: member.role,
        role_id: member.roleId,
        provider_flavor: member.providerFlavor,
        model: member.model,
        reasoning_effort: member.reasoningEffort,
        isolation_mode: member.isolationMode,
        workspace_root: member.workspaceRoot,
        control_owner: member.controlOwner,
        membership_state: member.membershipState,
        revision: member.revision,
        supersedes_member_id: member.supersedesMemberId,
        superseded_by_member_id: member.supersededByMemberId,
        spawned_for_task_id: member.spawnedForTaskId,
        created_at: member.createdAt,
        updated_at: member.updatedAt,
        archived_at: member.archivedAt,
        removed_at: member.removedAt
    })
    return getTeamMemberBySessionId(db, member.sessionId) ?? member
}

export function listTeamMembersByProjectId(db: Database, projectId: string): TeamMemberRecord[] {
    return db.query('SELECT * FROM team_members WHERE project_id = ? ORDER BY created_at ASC').all(projectId).map((row) => toTeamMember(row as DbTeamMemberRow))
}

export function upsertTeamTask(db: Database, task: TeamTaskRecord): TeamTaskRecord {
    db.query(`
        INSERT INTO team_tasks (
            id, project_id, parent_task_id, title, description, acceptance_criteria, status,
            assignee_member_id, reviewer_member_id, verifier_member_id, priority, depends_on,
            retry_count, created_at, updated_at, completed_at
        ) VALUES (
            @id, @project_id, @parent_task_id, @title, @description, @acceptance_criteria, @status,
            @assignee_member_id, @reviewer_member_id, @verifier_member_id, @priority, @depends_on,
            @retry_count, @created_at, @updated_at, @completed_at
        )
        ON CONFLICT(id) DO UPDATE SET
            project_id = excluded.project_id,
            parent_task_id = excluded.parent_task_id,
            title = excluded.title,
            description = excluded.description,
            acceptance_criteria = excluded.acceptance_criteria,
            status = excluded.status,
            assignee_member_id = excluded.assignee_member_id,
            reviewer_member_id = excluded.reviewer_member_id,
            verifier_member_id = excluded.verifier_member_id,
            priority = excluded.priority,
            depends_on = excluded.depends_on,
            retry_count = excluded.retry_count,
            updated_at = excluded.updated_at,
            completed_at = excluded.completed_at
    `).run({
        id: task.id,
        project_id: task.projectId,
        parent_task_id: task.parentTaskId,
        title: task.title,
        description: task.description,
        acceptance_criteria: task.acceptanceCriteria,
        status: task.status,
        assignee_member_id: task.assigneeMemberId,
        reviewer_member_id: task.reviewerMemberId,
        verifier_member_id: task.verifierMemberId,
        priority: task.priority,
        depends_on: JSON.stringify(task.dependsOn),
        retry_count: task.retryCount,
        created_at: task.createdAt,
        updated_at: task.updatedAt,
        completed_at: task.completedAt
    })
    const row = db.query('SELECT * FROM team_tasks WHERE id = ?').get(task.id) as DbTeamTaskRow | undefined
    return row ? toTeamTask(row) : task
}

export function listTeamTasksByProjectId(db: Database, projectId: string): TeamTaskRecord[] {
    return db.query('SELECT * FROM team_tasks WHERE project_id = ? ORDER BY created_at ASC').all(projectId).map((row) => toTeamTask(row as DbTeamTaskRow))
}

export function insertTeamEvent(db: Database, event: TeamEventRecord): TeamEventRecord {
    db.query(`
        INSERT INTO team_events (
            id, project_id, kind, actor_type, actor_id, target_type, target_id, payload, created_at
        ) VALUES (
            @id, @project_id, @kind, @actor_type, @actor_id, @target_type, @target_id, @payload, @created_at
        )
    `).run({
        id: event.id,
        project_id: event.projectId,
        kind: event.kind,
        actor_type: event.actorType,
        actor_id: event.actorId,
        target_type: event.targetType,
        target_id: event.targetId,
        payload: event.payload ? JSON.stringify(event.payload) : null,
        created_at: event.createdAt
    })
    const row = db.query('SELECT * FROM team_events WHERE id = ?').get(event.id) as DbTeamEventRow | undefined
    return row ? toTeamEvent(row) : event
}

export function listTeamEventsByProjectId(db: Database, projectId: string, limit: number = 50): TeamEventRecord[] {
    return db.query(`
        SELECT * FROM team_events
        WHERE project_id = ?
        ORDER BY created_at DESC
        LIMIT ?
    `).all(projectId, limit).map((row) => toTeamEvent(row as DbTeamEventRow))
}

export function listTeamAcceptanceEventsByProjectId(db: Database, projectId: string): TeamEventRecord[] {
    return db.query(`
        SELECT * FROM team_events
        WHERE project_id = ?
          AND kind IN (${ACCEPTANCE_EVENT_KIND_SQL_PLACEHOLDERS})
        ORDER BY created_at ASC
    `).all(projectId, ...TEAM_ACCEPTANCE_EVENT_KINDS).map((row) => toTeamEvent(row as DbTeamEventRow))
}

export function listTeamTaskEvents(db: Database, taskId: string): TeamEventRecord[] {
    return db.query(`
        SELECT * FROM team_events
        WHERE target_type = 'task'
          AND target_id = ?
        ORDER BY created_at ASC
    `).all(taskId).map((row) => toTeamEvent(row as DbTeamEventRow))
}
