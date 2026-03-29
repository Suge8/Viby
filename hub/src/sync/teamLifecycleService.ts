import { randomUUID } from 'node:crypto'
import { getSessionLifecycleState } from '@viby/protocol'
import type {
    Session,
    TeamMemberRecord,
    TeamProject,
    TeamProjectHistoryResponse,
    TeamProjectSnapshot
} from '@viby/protocol/types'
import type { Store } from '../store'
import { SessionCache } from './sessionCache'
import { SessionLifecycleService } from './sessionLifecycleService'
import { TeamCoordinatorService } from './teamCoordinatorService'

const TEAM_ARCHIVED_BY = 'team'
const TEAM_MEMBER_ARCHIVE_REASON = 'Archived by manager teams'
const TEAM_PROJECT_ARCHIVE_REASON = 'Manager project archived'
const TEAM_LIFECYCLE_HISTORY_LIMIT = 200

export type TeamLifecycleActor = {
    actorType: 'manager' | 'user' | 'system'
    actorId: string | null
}

const DEFAULT_LIFECYCLE_ACTOR: TeamLifecycleActor = {
    actorType: 'user',
    actorId: null
}

export class TeamLifecycleError extends Error {
    readonly code: string
    readonly status: 404 | 409

    constructor(message: string, code: string, status: 404 | 409) {
        super(message)
        this.name = 'TeamLifecycleError'
        this.code = code
        this.status = status
    }
}

type TeamSessionTarget =
    | { kind: 'member'; member: TeamMemberRecord }
    | { kind: 'manager'; projectId: string }

export class TeamLifecycleService {
    constructor(
        private readonly store: Store,
        private readonly sessionCache: SessionCache,
        private readonly sessionLifecycleService: SessionLifecycleService,
        private readonly teamCoordinatorService: TeamCoordinatorService
    ) {
    }

    getProjectHistory(projectId: string): TeamProjectHistoryResponse | null {
        return this.teamCoordinatorService.getProjectHistory(projectId, TEAM_LIFECYCLE_HISTORY_LIMIT)
    }

    async archiveSession(sessionId: string): Promise<Session> { return await this.archiveSessionWithActor(sessionId, DEFAULT_LIFECYCLE_ACTOR) }
    async unarchiveSession(sessionId: string): Promise<Session> { return await this.unarchiveSessionWithActor(sessionId, DEFAULT_LIFECYCLE_ACTOR) }

    async archiveSessionWithActor(sessionId: string, actor: TeamLifecycleActor): Promise<Session> {
        const target = this.resolveSessionTarget(sessionId)
        if (!target) {
            return await this.sessionLifecycleService.archiveSession(sessionId)
        }

        if (target.kind === 'manager') {
            return await this.archiveProject(target.projectId, actor)
        }

        if (target.member.membershipState === 'removed' || target.member.membershipState === 'superseded') {
            await this.ensureSessionArchived(target.member.sessionId, TEAM_MEMBER_ARCHIVE_REASON)
            return this.requireSession(target.member.sessionId)
        }

        return await this.archiveMember(target.member, actor)
    }

    async unarchiveSessionWithActor(sessionId: string, actor: TeamLifecycleActor): Promise<Session> {
        const target = this.resolveSessionTarget(sessionId)
        if (!target) {
            return await this.sessionLifecycleService.unarchiveSession(sessionId)
        }

        if (target.kind === 'manager') {
            return await this.reopenProject(target.projectId, actor)
        }

        return await this.restoreMember(target.member, actor)
    }

    private resolveSessionTarget(sessionId: string): TeamSessionTarget | null {
        const member = this.store.teams.getMemberBySessionId(sessionId)
        if (member) {
            return { kind: 'member', member }
        }

        const project = this.store.teams.getProjectByManagerSessionId(sessionId)
        if (project) {
            return { kind: 'manager', projectId: project.id }
        }

        return null
    }

    private async archiveProject(projectId: string, actor: TeamLifecycleActor): Promise<Session> {
        const snapshot = this.requireProjectSnapshot(projectId)

        for (const member of snapshot.members) {
            if (member.membershipState === 'active') {
                await this.archiveMember(member, actor)
                continue
            }

            await this.ensureSessionArchived(member.sessionId, TEAM_PROJECT_ARCHIVE_REASON)
        }

        await this.ensureSessionArchived(snapshot.project.managerSessionId, TEAM_PROJECT_ARCHIVE_REASON)

        if (snapshot.project.status !== 'archived' || snapshot.project.archivedAt === null) {
            const now = Date.now()
            this.teamCoordinatorService.applyCommand({
                type: 'upsert-project',
                project: {
                    ...snapshot.project,
                    status: 'archived',
                    updatedAt: now,
                    archivedAt: snapshot.project.archivedAt ?? now
                },
                event: {
                    id: randomUUID(),
                    projectId,
                    kind: 'project-archived',
                    actorType: actor.actorType,
                    actorId: actor.actorId,
                    targetType: 'project',
                    targetId: projectId,
                    payload: null,
                    createdAt: now
                },
                affectedSessionIds: [snapshot.project.managerSessionId]
            })
        }

        return this.requireSession(snapshot.project.managerSessionId)
    }

    private async reopenProject(projectId: string, actor: TeamLifecycleActor): Promise<Session> {
        const snapshot = this.requireProjectSnapshot(projectId)
        await this.ensureSessionRestored(snapshot.project.managerSessionId)

        if (snapshot.project.status === 'archived' || snapshot.project.archivedAt !== null) {
            const now = Date.now()
            const restoredStatus = this.resolveProjectRestoredStatus(snapshot.project)
            this.teamCoordinatorService.applyCommand({
                type: 'upsert-project',
                project: {
                    ...snapshot.project,
                    status: restoredStatus,
                    updatedAt: now,
                    archivedAt: null
                },
                event: {
                    id: randomUUID(),
                    projectId,
                    kind: 'project-reopened',
                    actorType: actor.actorType,
                    actorId: actor.actorId,
                    targetType: 'project',
                    targetId: projectId,
                    payload: {
                        status: restoredStatus
                    },
                    createdAt: now
                },
                affectedSessionIds: [snapshot.project.managerSessionId]
            })
        }

        return this.requireSession(snapshot.project.managerSessionId)
    }

    private async archiveMember(member: TeamMemberRecord, actor: TeamLifecycleActor): Promise<Session> {
        await this.ensureSessionArchived(member.sessionId, TEAM_MEMBER_ARCHIVE_REASON)

        if (member.membershipState !== 'archived' || member.archivedAt === null || member.controlOwner !== 'manager') {
            const now = Date.now()
            this.teamCoordinatorService.applyCommand({
                type: 'upsert-member',
                member: {
                    ...member,
                    controlOwner: 'manager',
                    membershipState: 'archived',
                    updatedAt: now,
                    archivedAt: member.archivedAt ?? now
                },
                event: {
                    id: randomUUID(),
                    projectId: member.projectId,
                    kind: 'member-archived',
                    actorType: actor.actorType,
                    actorId: actor.actorId,
                    targetType: 'member',
                    targetId: member.id,
                    payload: null,
                    createdAt: now
                },
                affectedSessionIds: [member.managerSessionId, member.sessionId]
            })
        }

        return this.requireSession(member.sessionId)
    }

    private async restoreMember(member: TeamMemberRecord, actor: TeamLifecycleActor): Promise<Session> {
        if (member.membershipState === 'removed' || member.membershipState === 'superseded') {
            throw new TeamLifecycleError(
                'Historical members can only return through an explicit revision, not session restore',
                'team_member_restore_unavailable',
                409
            )
        }

        if (this.requireProjectSnapshot(member.projectId).project.status === 'archived') {
            await this.reopenProject(member.projectId, actor)
        }

        await this.ensureSessionRestored(member.sessionId)

        if (member.membershipState !== 'active' || member.archivedAt !== null || member.controlOwner !== 'manager') {
            const now = Date.now()
            this.teamCoordinatorService.applyCommand({
                type: 'upsert-member',
                member: {
                    ...member,
                    controlOwner: 'manager',
                    membershipState: 'active',
                    updatedAt: now,
                    archivedAt: null
                },
                event: {
                    id: randomUUID(),
                    projectId: member.projectId,
                    kind: 'member-restored',
                    actorType: actor.actorType,
                    actorId: actor.actorId,
                    targetType: 'member',
                    targetId: member.id,
                    payload: null,
                    createdAt: now
                },
                affectedSessionIds: [member.managerSessionId, member.sessionId]
            })
        }

        return this.requireSession(member.sessionId)
    }

    private async ensureSessionArchived(sessionId: string, archiveReason: string): Promise<void> {
        const session = this.requireSession(sessionId)
        if (getSessionLifecycleState(session) === 'archived' && !session.active) {
            return
        }

        await this.sessionLifecycleService.archiveSession(sessionId, {
            archivedBy: TEAM_ARCHIVED_BY,
            archiveReason
        })
    }

    private async ensureSessionRestored(sessionId: string): Promise<void> {
        const session = this.requireSession(sessionId)
        if (getSessionLifecycleState(session) !== 'archived') {
            return
        }

        await this.sessionLifecycleService.unarchiveSession(sessionId)
    }

    private requireProjectSnapshot(projectId: string): TeamProjectSnapshot {
        const snapshot = this.teamCoordinatorService.getProjectSnapshot(projectId)
        if (!snapshot) {
            throw new TeamLifecycleError('Team project not found', 'team_project_not_found', 404)
        }
        return snapshot
    }

    private requireSession(sessionId: string): Session {
        const session = this.sessionCache.getSession(sessionId) ?? this.sessionCache.refreshSession(sessionId)
        if (!session) {
            throw new TeamLifecycleError('Session not found', 'session_not_found', 404)
        }
        return session
    }

    private resolveProjectRestoredStatus(project: TeamProject): TeamProject['status'] { return project.deliveredAt ? 'delivered' : 'active' }
}
