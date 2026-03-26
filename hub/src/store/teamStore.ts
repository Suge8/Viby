import type { Database } from 'bun:sqlite'
import type {
    SessionTeamContext,
    TeamEventRecord,
    TeamMemberRecord,
    TeamProject,
    TeamTaskRecord
} from '@viby/protocol/types'
import {
    getSessionTeamContext,
    getTeamMemberBySessionId,
    getTeamProject,
    getTeamProjectByManagerSessionId,
    insertTeamEvent,
    listTeamEventsByProjectId,
    listTeamMembersByProjectId,
    listTeamTasksByProjectId,
    upsertTeamMember,
    upsertTeamProject,
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

    getMemberBySessionId(sessionId: string): TeamMemberRecord | null {
        return getTeamMemberBySessionId(this.db, sessionId)
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

    getSessionTeamContext(sessionId: string): SessionTeamContext | null {
        return getSessionTeamContext(this.db, sessionId)
    }
}
