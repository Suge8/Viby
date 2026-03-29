import type { Database } from 'bun:sqlite'
import type { SessionTeamContext, TeamMemberRecord } from '@viby/protocol/types'
import { resolveManagerTitle } from './teamRecordMappers'

type DbSessionTeamContextRow = {
    project_id: string
    manager_session_id: string
    project_title: string
    project_status: SessionTeamContext['projectStatus']
    manager_metadata: string | null
    member_id: string | null
    member_role: SessionTeamContext['memberRole'] | null
    member_role_id: string | null
    member_role_name: string | null
    member_role_prompt_extension: string | null
    member_revision: number | null
    control_owner: SessionTeamContext['controlOwner'] | null
    membership_state: SessionTeamContext['membershipState'] | null
}

function getProjectCounts(
    db: Database,
    projectId: string
): Pick<SessionTeamContext, 'activeMemberCount' | 'archivedMemberCount' | 'runningMemberCount' | 'blockedTaskCount'> {
    const memberRows = db.query(`
        SELECT membership_state, COUNT(*) AS count
        FROM team_members
        WHERE project_id = ?
        GROUP BY membership_state
    `).all(projectId) as Array<{
        membership_state: TeamMemberRecord['membershipState']
        count: number
    }>
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
            NULL AS member_role_id,
            NULL AS member_role_name,
            NULL AS member_role_prompt_extension,
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
            members.role_id AS member_role_id,
            roles.name AS member_role_name,
            roles.prompt_extension AS member_role_prompt_extension,
            members.revision AS member_revision,
            members.control_owner AS control_owner,
            members.membership_state AS membership_state
        FROM team_members AS members
        INNER JOIN team_projects AS projects ON projects.id = members.project_id
        INNER JOIN team_roles AS roles
            ON roles.project_id = members.project_id
           AND roles.id = members.role_id
        LEFT JOIN sessions AS manager_session ON manager_session.id = projects.manager_session_id
        WHERE members.session_id = ?
        LIMIT 1
    `).get(sessionId) as DbSessionTeamContextRow | undefined
    if (!row) {
        return null
    }

    return {
        projectId: row.project_id,
        sessionRole: row.member_id ? 'member' : 'manager',
        managerSessionId: row.manager_session_id,
        managerTitle: resolveManagerTitle(row.project_title, row.manager_metadata),
        memberId: row.member_id ?? undefined,
        memberRole: row.member_role ?? undefined,
        memberRoleId: row.member_role_id ?? undefined,
        memberRoleName: row.member_role_name ?? undefined,
        memberRolePromptExtension: row.member_role_prompt_extension ?? undefined,
        memberRevision: row.member_revision ?? undefined,
        controlOwner: row.control_owner ?? undefined,
        membershipState: row.membership_state ?? undefined,
        projectStatus: row.project_status,
        ...getProjectCounts(db, row.project_id)
    }
}
