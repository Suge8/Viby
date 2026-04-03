import type { Database } from 'bun:sqlite'
import type {
    SessionTeamContext,
    TeamEventRecord,
    TeamMemberRecord,
    TeamProject,
    TeamRoleDefinition,
    TeamTaskRecord
} from '@viby/protocol/types'
import {
    getTeamMember,
    getSessionTeamContext,
    getTeamMemberBySessionId,
    getTeamProject,
    getTeamProjectByManagerSessionId,
    getTeamRole,
    getTeamTask,
    deleteTeamProject,
    deleteTeamRole,
    listTeamAcceptanceEventsByProjectId,
    insertTeamEvent,
    listTeamEventsByProjectId,
    listTeamMembersByProjectId,
    listTeamRolesByProjectId,
    listTeamTaskEvents,
    listTeamTasksByProjectId,
    upsertTeamMember,
    upsertTeamProject,
    upsertTeamRole,
    upsertTeamTask
} from './teams'

export class TeamStore {
    constructor(private readonly db: Database) {
    }

    transaction<T>(operation: () => T): T {
        this.db.exec('BEGIN IMMEDIATE')
        try {
            const result = operation()
            this.db.exec('COMMIT')
            return result
        } catch (error) {
            this.db.exec('ROLLBACK')
            throw error
        }
    }

    getProject(id: string): TeamProject | null {
        return getTeamProject(this.db, id)
    }

    getProjectByManagerSessionId(managerSessionId: string): TeamProject | null {
        return getTeamProjectByManagerSessionId(this.db, managerSessionId)
    }

    upsertProject(project: TeamProject): TeamProject {
        return upsertTeamProject(this.db, project)
    }

    deleteProject(projectId: string): void {
        deleteTeamProject(this.db, projectId)
    }

    getRole(projectId: string, roleId: string): TeamRoleDefinition | null {
        return getTeamRole(this.db, projectId, roleId)
    }

    upsertRole(role: TeamRoleDefinition): TeamRoleDefinition {
        return upsertTeamRole(this.db, role)
    }

    deleteRole(projectId: string, roleId: string): void {
        deleteTeamRole(this.db, projectId, roleId)
    }

    listProjectRoles(projectId: string): TeamRoleDefinition[] {
        return listTeamRolesByProjectId(this.db, projectId)
    }

    getTask(taskId: string): TeamTaskRecord | null {
        return getTeamTask(this.db, taskId)
    }

    getMemberBySessionId(sessionId: string): TeamMemberRecord | null {
        return getTeamMemberBySessionId(this.db, sessionId)
    }

    getMember(memberId: string): TeamMemberRecord | null {
        return getTeamMember(this.db, memberId)
    }

    upsertMember(member: TeamMemberRecord): TeamMemberRecord {
        return upsertTeamMember(this.db, member)
    }

    listProjectMembers(projectId: string): TeamMemberRecord[] {
        return listTeamMembersByProjectId(this.db, projectId)
    }

    upsertTask(task: TeamTaskRecord): TeamTaskRecord {
        return upsertTeamTask(this.db, task)
    }

    listProjectTasks(projectId: string): TeamTaskRecord[] {
        return listTeamTasksByProjectId(this.db, projectId)
    }

    insertEvent(event: TeamEventRecord): TeamEventRecord {
        return insertTeamEvent(this.db, event)
    }

    listProjectEvents(projectId: string, limit?: number): TeamEventRecord[] {
        return listTeamEventsByProjectId(this.db, projectId, limit)
    }

    listProjectAcceptanceEvents(projectId: string): TeamEventRecord[] {
        return listTeamAcceptanceEventsByProjectId(this.db, projectId)
    }

    listTaskEvents(taskId: string): TeamEventRecord[] {
        return listTeamTaskEvents(this.db, taskId)
    }

    getSessionTeamContext(sessionId: string): SessionTeamContext | null {
        return getSessionTeamContext(this.db, sessionId)
    }
}
