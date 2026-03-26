import type { Database } from 'bun:sqlite'
import type {
    SessionTeamContext,
    TeamEventRecord,
    TeamMemberRecord,
    TeamProject,
    TeamTaskRecord
} from '@viby/protocol/types'
import { safeJsonParse } from './json'

type DbTeamProjectRow = {
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

type DbTeamMemberRow = {
    id: string
    project_id: string
    session_id: string
    manager_session_id: string
    role: TeamMemberRecord['role']
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

type DbTeamTaskRow = {
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

type DbTeamEventRow = {
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

type DbSessionTeamContextRow = {
    project_id: string
    manager_session_id: string
    project_title: string
    project_status: SessionTeamContext['projectStatus']
    manager_metadata: string | null
    member_id: string | null
    member_role: SessionTeamContext['memberRole'] | null
    member_revision: number | null
    control_owner: SessionTeamContext['controlOwner'] | null
    membership_state: SessionTeamContext['membershipState'] | null
}

function toTeamProject(row: DbTeamProjectRow): TeamProject {
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

function toTeamMember(row: DbTeamMemberRow): TeamMemberRecord {
    return {
        id: row.id,
        projectId: row.project_id,
        sessionId: row.session_id,
        managerSessionId: row.manager_session_id,
        role: row.role,
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

function toTeamTask(row: DbTeamTaskRow): TeamTaskRecord {
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
        dependsOn: Array.isArray(dependsOn) ? dependsOn.filter((value): value is string => typeof value === 'string') : [],
        retryCount: row.retry_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at
    }
}

function toTeamEvent(row: DbTeamEventRow): TeamEventRecord {
    const payload = safeJsonParse(row.payload)
    return {
        id: row.id,
        projectId: row.project_id,
        kind: row.kind,
        actorType: row.actor_type,
        actorId: row.actor_id,
        targetType: row.target_type,
        targetId: row.target_id,
        payload: payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : null,
        createdAt: row.created_at
    }
}

function resolveManagerTitle(projectTitle: string, metadataJson: string | null): string {
    const metadata = safeJsonParse(metadataJson)
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
        const name = (metadata as Record<string, unknown>).name
        if (typeof name === 'string' && name.length > 0) {
            return name
        }
    }
    return projectTitle
}

function getProjectCounts(db: Database, projectId: string): Pick<SessionTeamContext, 'activeMemberCount' | 'archivedMemberCount' | 'runningMemberCount' | 'blockedTaskCount'> {
    const memberRows = db.query(`
        SELECT membership_state, COUNT(*) AS count
        FROM team_members
        WHERE project_id = ?
        GROUP BY membership_state
    `).all(projectId) as Array<{ membership_state: TeamMemberRecord['membershipState']; count: number }>
    const stateCounts = new Map(memberRows.map((row) => [row.membership_state, row.count]))
    const runningRow = db.query(`
        SELECT COUNT(*) AS count
        FROM team_members AS members
        INNER JOIN sessions ON sessions.id = members.session_id
        WHERE members.project_id = ?
          AND members.membership_state = 'active'
          AND sessions.active = 1
    `).get(projectId) as { count: number } | undefined
    const blockedRow = db.query(`
        SELECT COUNT(*) AS count
        FROM team_tasks
        WHERE project_id = ?
          AND status = 'blocked'
    `).get(projectId) as { count: number } | undefined
    return {
        activeMemberCount: stateCounts.get('active') ?? 0,
        archivedMemberCount: stateCounts.get('archived') ?? 0,
        runningMemberCount: runningRow?.count ?? 0,
        blockedTaskCount: blockedRow?.count ?? 0
    }
}

export function getTeamProject(db: Database, id: string): TeamProject | null {
    const row = db.query('SELECT * FROM team_projects WHERE id = ?').get(id) as DbTeamProjectRow | undefined
    return row ? toTeamProject(row) : null
}

export function getTeamProjectByManagerSessionId(db: Database, managerSessionId: string): TeamProject | null {
    const row = db.query('SELECT * FROM team_projects WHERE manager_session_id = ? LIMIT 1').get(managerSessionId) as DbTeamProjectRow | undefined
    return row ? toTeamProject(row) : null
}

export function upsertTeamProject(db: Database, project: TeamProject): TeamProject {
    db.query(`
        INSERT INTO team_projects (
            id, manager_session_id, machine_id, root_directory, title, goal, status,
            max_active_members, default_isolation_mode, created_at, updated_at, delivered_at, archived_at
        ) VALUES (
            @id, @manager_session_id, @machine_id, @root_directory, @title, @goal, @status,
            @max_active_members, @default_isolation_mode, @created_at, @updated_at, @delivered_at, @archived_at
        )
        ON CONFLICT(id) DO UPDATE SET
            manager_session_id = excluded.manager_session_id,
            machine_id = excluded.machine_id,
            root_directory = excluded.root_directory,
            title = excluded.title,
            goal = excluded.goal,
            status = excluded.status,
            max_active_members = excluded.max_active_members,
            default_isolation_mode = excluded.default_isolation_mode,
            updated_at = excluded.updated_at,
            delivered_at = excluded.delivered_at,
            archived_at = excluded.archived_at
    `).run({
        id: project.id,
        manager_session_id: project.managerSessionId,
        machine_id: project.machineId,
        root_directory: project.rootDirectory,
        title: project.title,
        goal: project.goal,
        status: project.status,
        max_active_members: project.maxActiveMembers,
        default_isolation_mode: project.defaultIsolationMode,
        created_at: project.createdAt,
        updated_at: project.updatedAt,
        delivered_at: project.deliveredAt,
        archived_at: project.archivedAt
    })
    return getTeamProject(db, project.id) ?? project
}

export function getTeamMemberBySessionId(db: Database, sessionId: string): TeamMemberRecord | null {
    const row = db.query('SELECT * FROM team_members WHERE session_id = ? LIMIT 1').get(sessionId) as DbTeamMemberRow | undefined
    return row ? toTeamMember(row) : null
}

export function upsertTeamMember(db: Database, member: TeamMemberRecord): TeamMemberRecord {
    db.query(`
        INSERT INTO team_members (
            id, project_id, session_id, manager_session_id, role, provider_flavor, model, reasoning_effort,
            isolation_mode, workspace_root, control_owner, membership_state, revision,
            supersedes_member_id, superseded_by_member_id, spawned_for_task_id,
            created_at, updated_at, archived_at, removed_at
        ) VALUES (
            @id, @project_id, @session_id, @manager_session_id, @role, @provider_flavor, @model, @reasoning_effort,
            @isolation_mode, @workspace_root, @control_owner, @membership_state, @revision,
            @supersedes_member_id, @superseded_by_member_id, @spawned_for_task_id,
            @created_at, @updated_at, @archived_at, @removed_at
        )
        ON CONFLICT(id) DO UPDATE SET
            project_id = excluded.project_id,
            session_id = excluded.session_id,
            manager_session_id = excluded.manager_session_id,
            role = excluded.role,
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

export function getSessionTeamContext(db: Database, sessionId: string): SessionTeamContext | null {
    const managerRow = db.query(`
        SELECT
            projects.id AS project_id,
            projects.manager_session_id,
            projects.title AS project_title,
            projects.status AS project_status,
            manager_session.metadata AS manager_metadata,
            NULL AS member_id,
            NULL AS member_role,
            NULL AS member_revision,
            NULL AS control_owner,
            NULL AS membership_state
        FROM team_projects AS projects
        LEFT JOIN sessions AS manager_session ON manager_session.id = projects.manager_session_id
        WHERE projects.manager_session_id = ?
        LIMIT 1
    `).get(sessionId) as DbSessionTeamContextRow | undefined
    const row = managerRow ?? db.query(`
        SELECT
            projects.id AS project_id,
            projects.manager_session_id,
            projects.title AS project_title,
            projects.status AS project_status,
            manager_session.metadata AS manager_metadata,
            members.id AS member_id,
            members.role AS member_role,
            members.revision AS member_revision,
            members.control_owner AS control_owner,
            members.membership_state AS membership_state
        FROM team_members AS members
        INNER JOIN team_projects AS projects ON projects.id = members.project_id
        LEFT JOIN sessions AS manager_session ON manager_session.id = projects.manager_session_id
        WHERE members.session_id = ?
        LIMIT 1
    `).get(sessionId) as DbSessionTeamContextRow | undefined
    if (!row) return null
    return {
        projectId: row.project_id,
        sessionRole: row.member_id ? 'member' : 'manager',
        managerSessionId: row.manager_session_id,
        managerTitle: resolveManagerTitle(row.project_title, row.manager_metadata),
        memberId: row.member_id ?? undefined,
        memberRole: row.member_role ?? undefined,
        memberRevision: row.member_revision ?? undefined,
        controlOwner: row.control_owner ?? undefined,
        membershipState: row.membership_state ?? undefined,
        projectStatus: row.project_status,
        ...getProjectCounts(db, row.project_id)
    }
}
