import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import type {
    Session,
    SyncEvent,
    TeamEventRecord,
    TeamMemberRecord,
    TeamProject,
    TeamProjectSnapshot,
    TeamTaskRecord
} from '@viby/protocol/types'
import type { Store } from '../store'
import { applyTeamStateDelta, extractTeamStateFromMessageContent } from './teams'

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

export type TeamCoordinatorCommandResult = {
    projectId: string
    managerSessionId: string
    affectedSessionIds: string[]
    snapshot: TeamProjectSnapshot
}

type LegacyProjectionInput = {
    sessionId: string
    content: unknown
    createdAt: number
}

type EmitSyncEvent = (event: SyncEvent) => void

const DEFAULT_MANAGER_PROJECT_TITLE = 'Manager Project'
const DEFAULT_MANAGER_PROJECT_MAX_ACTIVE_MEMBERS = 6
const DEFAULT_MANAGER_PROJECT_ISOLATION_MODE: TeamProject['defaultIsolationMode'] = 'hybrid'

function uniqueSessionIds(values: Array<string | null | undefined>): string[] {
    return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)))
}

function resolveManagerProjectTitle(metadata: Session['metadata']): string {
    const preferredName = metadata?.name?.trim()
    if (preferredName) {
        return preferredName
    }

    const rootDirectory = metadata?.path?.trim()
    if (rootDirectory) {
        const projectName = basename(rootDirectory)
        if (projectName && projectName !== '.' && projectName !== '/') {
            return projectName
        }
    }

    return DEFAULT_MANAGER_PROJECT_TITLE
}

function projectsMatch(left: TeamProject, right: TeamProject): boolean {
    return left.id === right.id
        && left.managerSessionId === right.managerSessionId
        && left.machineId === right.machineId
        && left.rootDirectory === right.rootDirectory
        && left.title === right.title
        && left.goal === right.goal
        && left.status === right.status
        && left.maxActiveMembers === right.maxActiveMembers
        && left.defaultIsolationMode === right.defaultIsolationMode
        && left.createdAt === right.createdAt
        && left.deliveredAt === right.deliveredAt
        && left.archivedAt === right.archivedAt
}

function isTeamProjectionEvent(event: SyncEvent): event is Extract<SyncEvent, { type: 'session-updated' }> {
    return event.type === 'session-updated'
}

export class TeamCoordinatorService {
    constructor(
        private readonly store: Store,
        private readonly emitSyncEvent?: EmitSyncEvent
    ) {
    }

    getProjectSnapshot(projectId: string): TeamProjectSnapshot | null {
        const project = this.store.teams.getProject(projectId)
        if (!project) {
            return null
        }

        return {
            project,
            members: this.store.teams.listProjectMembers(projectId),
            tasks: this.store.teams.listProjectTasks(projectId),
            events: this.store.teams.listProjectEvents(projectId)
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

        return {
            projectId,
            managerSessionId: snapshot.project.managerSessionId,
            affectedSessionIds,
            snapshot
        }
    }

    applyLegacyTranscriptProjection(input: LegacyProjectionInput): { updated: boolean; teamState: Session['teamState'] } {
        const delta = extractTeamStateFromMessageContent(input.content)
        if (!delta) {
            return { updated: false, teamState: undefined }
        }

        const existingSession = this.store.sessions.getSession(input.sessionId)
        const nextTeamState = applyTeamStateDelta(
            (existingSession?.teamState ?? null) as Session['teamState'],
            delta
        )
        const updated = this.store.sessions.setSessionTeamState(
            input.sessionId,
            nextTeamState,
            input.createdAt
        )
        if (updated) {
            this.emitSessionUpdates([input.sessionId])
        }

        return {
            updated,
            teamState: nextTeamState ?? undefined
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
            case 'upsert-task':
                this.store.teams.upsertTask(command.task)
                if (command.event) {
                    this.store.teams.insertEvent(command.event)
                }
                return command.task.projectId
            case 'record-event':
                this.store.teams.insertEvent(command.event)
                return command.event.projectId
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
            const event: SyncEvent = {
                type: 'session-updated',
                sessionId,
                data: { sid: sessionId }
            }
            if (isTeamProjectionEvent(event)) {
                this.emitSyncEvent?.(event)
            }
        }
    }
}
