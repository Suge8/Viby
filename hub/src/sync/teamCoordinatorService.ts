import { randomUUID } from 'node:crypto'
import type {
    Session,
    SyncEvent,
    TeamEventRecord,
    TeamMemberRecord,
    TeamProject,
    TeamProjectHistoryResponse,
    TeamProjectSnapshot,
    TeamRoleDefinition,
    TeamTaskRecord
} from '@viby/protocol/types'
import type { Store } from '../store'
import {
    DEFAULT_MANAGER_PROJECT_ISOLATION_MODE,
    DEFAULT_MANAGER_PROJECT_MAX_ACTIVE_MEMBERS,
    projectsMatch,
    resolveManagerProjectTitle,
    uniqueSessionIds
} from './teamCoordinatorProjectSupport'
import { buildTeamProjectSnapshot } from './teamProjectSnapshotBuilder'

export type TeamCoordinatorCommand =
    | {
        type: 'upsert-project'
        project: TeamProject
        event?: TeamEventRecord
        affectedSessionIds?: string[]
    }
    | {
        type: 'upsert-member'
        member: TeamMemberRecord
        event?: TeamEventRecord
        affectedSessionIds?: string[]
    }
    | {
        type: 'upsert-role'
        role: TeamRoleDefinition
        event?: TeamEventRecord
        affectedSessionIds?: string[]
    }
    | {
        type: 'delete-role'
        projectId: string
        roleId: TeamRoleDefinition['id']
        event?: TeamEventRecord
        affectedSessionIds?: string[]
    }
    | {
        type: 'upsert-task'
        task: TeamTaskRecord
        event?: TeamEventRecord
        affectedSessionIds?: string[]
    }
    | {
        type: 'record-event'
        event: TeamEventRecord
        affectedSessionIds?: string[]
    }
    | {
        type: 'batch'
        project?: TeamProject
        roles?: TeamRoleDefinition[]
        deletedRoleIds?: TeamRoleDefinition['id'][]
        members?: TeamMemberRecord[]
        tasks?: TeamTaskRecord[]
        events?: TeamEventRecord[]
        affectedSessionIds?: string[]
    }

export type TeamCoordinatorCommandResult = {
    projectId: string
    managerSessionId: string
    affectedSessionIds: string[]
    snapshot: TeamProjectSnapshot
}

type EmitSyncEvent = (event: SyncEvent) => void

export class TeamCoordinatorService {
    constructor(
        private readonly store: Store,
        private readonly emitSyncEvent?: EmitSyncEvent
    ) {
    }

    getProjectSnapshot(projectId: string): TeamProjectSnapshot | null {
        return buildTeamProjectSnapshot(this.store, projectId)
    }

    getProjectHistory(projectId: string, limit: number = 200): TeamProjectHistoryResponse | null {
        const project = this.store.teams.getProject(projectId)
        if (!project) {
            return null
        }

        return {
            projectId,
            events: this.store.teams.listProjectEvents(projectId, limit)
        }
    }

    getMember(memberId: string): TeamMemberRecord | null {
        return this.store.teams.getMember(memberId)
    }

    applyCommand(command: TeamCoordinatorCommand): TeamCoordinatorCommandResult {
        const projectId = this.store.teams.transaction(() => this.applyCommandMutation(command))
        const snapshot = this.requireProjectSnapshot(projectId)
        const affectedSessionIds = this.resolveAffectedSessionIds(snapshot, command.affectedSessionIds)
        this.emitSessionUpdates(affectedSessionIds)
        this.emitProjectUpdate(projectId, snapshot.project.managerSessionId, affectedSessionIds)

        return {
            projectId,
            managerSessionId: snapshot.project.managerSessionId,
            affectedSessionIds,
            snapshot
        }
    }

    ensureManagerProject(session: Session): TeamCoordinatorCommandResult {
        const now = Date.now()
        const existing = this.store.teams.getProjectByManagerSessionId(session.id)
        const project: TeamProject = {
            id: existing?.id ?? session.id,
            managerSessionId: session.id,
            machineId: session.metadata?.machineId ?? null,
            rootDirectory: session.metadata?.path ?? null,
            title: resolveManagerProjectTitle(session.metadata),
            goal: existing?.goal ?? null,
            status: existing?.status ?? 'active',
            maxActiveMembers: existing?.maxActiveMembers ?? DEFAULT_MANAGER_PROJECT_MAX_ACTIVE_MEMBERS,
            defaultIsolationMode: existing?.defaultIsolationMode ?? DEFAULT_MANAGER_PROJECT_ISOLATION_MODE,
            createdAt: existing?.createdAt ?? session.createdAt ?? now,
            updatedAt: now,
            deliveredAt: existing?.deliveredAt ?? null,
            archivedAt: existing?.archivedAt ?? null
        }

        const created = !existing
        const changed = !existing || !projectsMatch(existing, project)
        if (changed) {
            const event = created
                ? {
                    id: randomUUID(),
                    projectId: project.id,
                    kind: 'project-created' as const,
                    actorType: 'manager' as const,
                    actorId: session.id,
                    targetType: 'project' as const,
                    targetId: project.id,
                    payload: null,
                    createdAt: now
                }
                : undefined

            return this.applyCommand({
                type: 'upsert-project',
                project,
                event,
                affectedSessionIds: [session.id]
            })
        }

        const snapshot = this.requireProjectSnapshot(project.id)
        return {
            projectId: project.id,
            managerSessionId: project.managerSessionId,
            affectedSessionIds: [session.id],
            snapshot
        }
    }

    private applyCommandMutation(command: TeamCoordinatorCommand): string {
        switch (command.type) {
            case 'upsert-project':
                this.store.teams.upsertProject(command.project)
                if (command.event) {
                    this.store.teams.insertEvent(command.event)
                }
                return command.project.id
            case 'upsert-member':
                this.store.teams.upsertMember(command.member)
                if (command.event) {
                    this.store.teams.insertEvent(command.event)
                }
                return command.member.projectId
            case 'upsert-role':
                this.store.teams.upsertRole(command.role)
                if (command.event) {
                    this.store.teams.insertEvent(command.event)
                }
                return command.role.projectId
            case 'delete-role':
                this.store.teams.deleteRole(command.projectId, command.roleId)
                if (command.event) {
                    this.store.teams.insertEvent(command.event)
                }
                return command.projectId
            case 'upsert-task':
                this.store.teams.upsertTask(command.task)
                if (command.event) {
                    this.store.teams.insertEvent(command.event)
                }
                return command.task.projectId
            case 'record-event':
                this.store.teams.insertEvent(command.event)
                return command.event.projectId
            case 'batch': {
                const projectId = command.project?.id
                    ?? command.roles?.[0]?.projectId
                    ?? command.members?.[0]?.projectId
                    ?? command.tasks?.[0]?.projectId
                    ?? command.events?.[0]?.projectId

                if (!projectId) {
                    throw new Error('Batch team command is missing a project target')
                }

                if (command.project) {
                    this.store.teams.upsertProject(command.project)
                }
                for (const role of command.roles ?? []) {
                    this.store.teams.upsertRole(role)
                }
                for (const roleId of command.deletedRoleIds ?? []) {
                    this.store.teams.deleteRole(projectId, roleId)
                }
                for (const member of command.members ?? []) {
                    this.store.teams.upsertMember(member)
                }
                for (const task of command.tasks ?? []) {
                    this.store.teams.upsertTask(task)
                }
                for (const event of command.events ?? []) {
                    this.store.teams.insertEvent(event)
                }

                return projectId
            }
        }
    }

    private requireProjectSnapshot(projectId: string): TeamProjectSnapshot {
        const snapshot = this.getProjectSnapshot(projectId)
        if (!snapshot) {
            throw new Error(`Team project not found: ${projectId}`)
        }

        return snapshot
    }

    private resolveAffectedSessionIds(
        snapshot: TeamProjectSnapshot,
        explicitSessionIds: string[] | undefined
    ): string[] {
        return uniqueSessionIds([
            snapshot.project.managerSessionId,
            ...snapshot.members.map((member) => member.sessionId),
            ...(explicitSessionIds ?? [])
        ])
    }

    private emitSessionUpdates(sessionIds: string[]): void {
        for (const sessionId of sessionIds) {
            this.emitSyncEvent?.({
                type: 'session-updated',
                sessionId,
                data: { sid: sessionId }
            })
        }
    }

    private emitProjectUpdate(
        projectId: string,
        managerSessionId: string,
        affectedSessionIds: string[]
    ): void {
        this.emitSyncEvent?.({
            type: 'team-project-updated',
            projectId,
            managerSessionId,
            affectedSessionIds
        })
    }
}
