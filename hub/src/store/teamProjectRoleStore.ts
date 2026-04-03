import type { Database } from 'bun:sqlite'
import {
    createBuiltInTeamRoleDefinition,
    TEAM_MEMBER_ROLE_PROTOTYPES
} from '@viby/protocol'
import type {
    TeamProject,
    TeamRoleDefinition,
} from '@viby/protocol/types'
import {
    type DbTeamProjectRow,
    type DbTeamRoleRow,
    toTeamProject,
    toTeamRole,
} from './teamRecordMappers'

function seedBuiltInProjectRoles(db: Database, project: TeamProject): void {
    const upsert = db.query(`
        INSERT OR IGNORE INTO team_roles (
            project_id, id, source, prototype, name, prompt_extension,
            provider_flavor, model, reasoning_effort, isolation_mode,
            created_at, updated_at
        ) VALUES (
            @project_id, @id, @source, @prototype, @name, @prompt_extension,
            @provider_flavor, @model, @reasoning_effort, @isolation_mode,
            @created_at, @updated_at
        )
    `)

    for (const prototype of TEAM_MEMBER_ROLE_PROTOTYPES) {
        const definition = createBuiltInTeamRoleDefinition(project.id, prototype, project.createdAt)
        upsert.run({
            project_id: definition.projectId,
            id: definition.id,
            source: definition.source,
            prototype: definition.prototype,
            name: definition.name,
            prompt_extension: definition.promptExtension,
            provider_flavor: definition.providerFlavor,
            model: definition.model,
            reasoning_effort: definition.reasoningEffort,
            isolation_mode: definition.isolationMode,
            created_at: definition.createdAt,
            updated_at: definition.updatedAt
        })
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
    seedBuiltInProjectRoles(db, project)
    return getTeamProject(db, project.id) ?? project
}

export function getTeamRole(
    db: Database,
    projectId: string,
    roleId: string
): TeamRoleDefinition | null {
    const row = db.query(`
        SELECT * FROM team_roles
        WHERE project_id = ?
          AND id = ?
        LIMIT 1
    `).get(projectId, roleId) as DbTeamRoleRow | undefined
    return row ? toTeamRole(row) : null
}

export function upsertTeamRole(db: Database, role: TeamRoleDefinition): TeamRoleDefinition {
    db.query(`
        INSERT INTO team_roles (
            project_id, id, source, prototype, name, prompt_extension,
            provider_flavor, model, reasoning_effort, isolation_mode,
            created_at, updated_at
        ) VALUES (
            @project_id, @id, @source, @prototype, @name, @prompt_extension,
            @provider_flavor, @model, @reasoning_effort, @isolation_mode,
            @created_at, @updated_at
        )
        ON CONFLICT(project_id, id) DO UPDATE SET
            source = excluded.source,
            prototype = excluded.prototype,
            name = excluded.name,
            prompt_extension = excluded.prompt_extension,
            provider_flavor = excluded.provider_flavor,
            model = excluded.model,
            reasoning_effort = excluded.reasoning_effort,
            isolation_mode = excluded.isolation_mode,
            updated_at = excluded.updated_at
    `).run({
        project_id: role.projectId,
        id: role.id,
        source: role.source,
        prototype: role.prototype,
        name: role.name,
        prompt_extension: role.promptExtension,
        provider_flavor: role.providerFlavor,
        model: role.model,
        reasoning_effort: role.reasoningEffort,
        isolation_mode: role.isolationMode,
        created_at: role.createdAt,
        updated_at: role.updatedAt
    })
    return getTeamRole(db, role.projectId, role.id) ?? role
}

export function deleteTeamProject(db: Database, projectId: string): void {
    db.query(`
        DELETE FROM team_projects
        WHERE id = ?
    `).run(projectId)
}

export function deleteTeamRole(db: Database, projectId: string, roleId: string): void {
    db.query(`
        DELETE FROM team_roles
        WHERE project_id = ?
          AND id = ?
    `).run(projectId, roleId)
}

export function listTeamRolesByProjectId(db: Database, projectId: string): TeamRoleDefinition[] {
    return db.query(`
        SELECT * FROM team_roles
        WHERE project_id = ?
        ORDER BY
            CASE source WHEN 'builtin' THEN 0 ELSE 1 END,
            created_at ASC,
            id ASC
    `).all(projectId).map((row) => toTeamRole(row as DbTeamRoleRow))
}
