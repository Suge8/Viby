import {
    isTerminalTeamTaskStatus,
    type TeamEventRecord,
    type TeamMemberRecord,
    type TeamProject,
    type TeamProjectSnapshot,
    type TeamTaskRecord
} from '@viby/protocol'
import type { Store } from '../store'
import {
    TeamAcceptanceError,
    type TeamTaskContext
} from './teamAcceptanceContracts'
import { resolveManagerInstructionBlock } from './teamControlSemantics'

export class TeamAcceptanceContextReader {
    constructor(private readonly store: Store) {
    }

    requireTaskContext(taskId: string, managerSessionId: string): TeamTaskContext {
        const task = this.requireOpenTask(taskId)
        const project = this.requireProject(task.projectId)
        this.requireSession(project.managerSessionId, 'team_manager_session_not_found')
        if (project.managerSessionId !== managerSessionId) {
            throw new TeamAcceptanceError(
                'Manager session does not own this task',
                'team_manager_mismatch',
                409
            )
        }

        return {
            task,
            project,
            taskEvents: this.store.teams.listTaskEvents(task.id),
            assignee: task.assigneeMemberId ? this.store.teams.getMember(task.assigneeMemberId) : null
        }
    }

    requireOpenTask(taskId: string): TeamTaskRecord {
        const task = this.store.teams.getTask(taskId)
        if (!task) {
            throw new TeamAcceptanceError('Team task not found', 'team_task_not_found', 404)
        }
        if (isTerminalTeamTaskStatus(task.status)) {
            throw new TeamAcceptanceError('Team task is already closed', 'team_task_closed', 409)
        }
        return task
    }

    requireProject(projectId: string): TeamProject {
        const project = this.store.teams.getProject(projectId)
        if (!project) {
            throw new TeamAcceptanceError('Team project not found', 'team_project_not_found', 404)
        }
        return project
    }

    requireMemberForTask(
        projectId: string,
        memberId: string,
        role: 'reviewer' | 'verifier'
    ): TeamMemberRecord {
        const member = this.store.teams.getMember(memberId)
        if (!member) {
            throw new TeamAcceptanceError('Team member not found', 'team_member_not_found', 404)
        }
        if (member.projectId !== projectId) {
            throw new TeamAcceptanceError(
                'Team member does not belong to this project',
                'team_member_project_mismatch',
                409
            )
        }
        if (member.membershipState !== 'active') {
            throw new TeamAcceptanceError('Team member is not active', 'team_member_inactive', 409)
        }
        if (member.role !== role) {
            throw new TeamAcceptanceError(
                `Team member is not a ${role}`,
                'team_member_role_mismatch',
                409
            )
        }
        this.requireSession(member.sessionId, 'team_member_session_not_found')
        const instructionBlock = resolveManagerInstructionBlock(this.store, member)
        if (instructionBlock) {
            throw new TeamAcceptanceError(
                instructionBlock.kind === 'pending_interject'
                    ? 'Team member is still completing a user interjection'
                    : 'Team member is currently under user control',
                'team_member_control_conflict',
                409
            )
        }
        return member
    }

    requireSession(sessionId: string, code: 'team_manager_session_not_found' | 'team_member_session_not_found'): void {
        if (!this.store.sessions.getSession(sessionId)) {
            const message = code === 'team_manager_session_not_found'
                ? 'Manager session not found'
                : 'Team member session not found'
            throw new TeamAcceptanceError(message, code, 404)
        }
    }

    requireSnapshotTask(snapshot: TeamProjectSnapshot, taskId: string): TeamTaskRecord {
        const task = snapshot.tasks.find((candidate) => candidate.id === taskId)
        if (!task) {
            throw new TeamAcceptanceError('Team task not found', 'team_task_not_found', 404)
        }
        return task
    }

    createTaskEvent(
        projectId: string,
        input: Omit<TeamEventRecord, 'id' | 'projectId' | 'targetType'>
    ): TeamEventRecord {
        return {
            id: crypto.randomUUID(),
            projectId,
            targetType: 'task',
            ...input
        }
    }
}
