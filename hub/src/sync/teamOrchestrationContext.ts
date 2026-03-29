import {
    isProjectReadyToDeliver,
    isTerminalTeamTaskStatus,
    type TeamMemberRecord,
    type TeamProject,
    type TeamProjectSnapshot,
    type TeamRoleDefinition,
    type TeamTaskRecord,
} from '@viby/protocol'
import type { Store } from '../store'
import { TeamOrchestrationError } from './teamOrchestrationContracts'
import { resolveManagerInstructionBlock } from './teamControlSemantics'
import {
    requireActiveProjectOwnedByManagerSnapshot,
    requireProjectOwnedByManagerSnapshot,
} from './teamOrchestrationProjectSnapshot'

export class TeamOrchestrationContextReader {
    constructor(private readonly store: Store) {
    }

    requireActiveManagerProject(managerSessionId: string): TeamProjectSnapshot {
        const project = this.store.teams.getProjectByManagerSessionId(managerSessionId)
        if (!project) {
            throw new TeamOrchestrationError('Team project not found', 'team_project_not_found', 404)
        }
        return requireActiveProjectOwnedByManagerSnapshot(this.store, project.id, managerSessionId)
    }

    requireProjectOwnedByManager(projectId: string, managerSessionId: string): TeamProjectSnapshot {
        return requireProjectOwnedByManagerSnapshot(this.store, projectId, managerSessionId)
    }

    requireActiveProjectOwnedByManager(
        projectId: string,
        managerSessionId: string,
    ): TeamProjectSnapshot {
        return requireActiveProjectOwnedByManagerSnapshot(this.store, projectId, managerSessionId)
    }

    requireProjectRole(
        projectId: string,
        managerSessionId: string,
        roleId: string,
    ): TeamRoleDefinition {
        const snapshot = this.requireActiveProjectOwnedByManager(projectId, managerSessionId)
        const role = snapshot.roles.find((candidate) => candidate.id === roleId)
        if (!role) {
            throw new TeamOrchestrationError('Team role not found', 'team_role_not_found', 404)
        }

        return role
    }

    requireCustomRole(
        projectId: string,
        managerSessionId: string,
        roleId: string,
    ): TeamRoleDefinition {
        const role = this.requireProjectRole(projectId, managerSessionId, roleId)
        if (role.source !== 'custom') {
            throw new TeamOrchestrationError(
                'Built-in team roles cannot be edited or deleted directly',
                'team_role_builtin_immutable',
                409,
            )
        }

        return role
    }

    requireMutableTask(taskId: string, managerSessionId: string): {
        project: TeamProject
        task: TeamTaskRecord
    } {
        const task = this.store.teams.getTask(taskId)
        if (!task) {
            throw new TeamOrchestrationError('Team task not found', 'team_task_not_found', 404)
        }

        if (isTerminalTeamTaskStatus(task.status)) {
            throw new TeamOrchestrationError('Team task is already closed', 'team_task_closed', 409)
        }
        const snapshot = requireActiveProjectOwnedByManagerSnapshot(this.store, task.projectId, managerSessionId)
        return { project: snapshot.project, task }
    }

    requireMember(memberId: string, managerSessionId: string): TeamMemberRecord {
        const member = this.store.teams.getMember(memberId)
        if (!member) {
            throw new TeamOrchestrationError('Team member not found', 'team_member_not_found', 404)
        }
        if (member.managerSessionId !== managerSessionId) {
            throw new TeamOrchestrationError(
                'Manager session does not own this team member',
                'team_manager_mismatch',
                409,
            )
        }
        if (member.membershipState === 'removed' || member.membershipState === 'superseded') {
            throw new TeamOrchestrationError(
                'Historical team members can only be referenced through a new revision',
                'team_member_historical',
                409,
            )
        }

        return member
    }

    requireActiveManagerControlledMember(
        memberId: string,
        managerSessionId: string,
    ): TeamMemberRecord {
        const member = this.requireActiveMember(memberId, managerSessionId)
        const instructionBlock = resolveManagerInstructionBlock(this.store, member)
        if (instructionBlock) {
            throw new TeamOrchestrationError(
                instructionBlock.kind === 'pending_interject'
                    ? 'Team member is still completing a user interjection'
                    : 'Team member is currently under user control',
                'team_member_control_conflict',
                409,
            )
        }

        return member
    }

    requireAssignee(memberId: string, managerSessionId: string): TeamMemberRecord {
        return this.requireActiveManagerControlledMember(memberId, managerSessionId)
    }

    requireRoleMember(
        memberId: string,
        managerSessionId: string,
        role: 'reviewer' | 'verifier',
    ): TeamMemberRecord {
        const member = this.requireActiveManagerControlledMember(memberId, managerSessionId)
        if (member.role !== role) {
            throw new TeamOrchestrationError(
                `Team member is not a ${role}`,
                'team_member_role_mismatch',
                409,
            )
        }

        return member
    }

    requireSpawnTask(taskId: string, managerSessionId: string): TeamTaskRecord {
        return this.requireMutableTask(taskId, managerSessionId).task
    }

    resolveProjectRoot(project: TeamProject): string {
        const rootDirectory = project.rootDirectory?.trim()
        if (!rootDirectory) {
            throw new TeamOrchestrationError(
                'Manager project root directory is unavailable',
                'team_project_root_unavailable',
                409,
            )
        }
        return rootDirectory
    }

    resolveProjectMachineId(project: TeamProject): string {
        const machineId = project.machineId?.trim()
        if (!machineId) {
            throw new TeamOrchestrationError(
                'Manager project machine is unavailable',
                'team_project_machine_unavailable',
                409,
            )
        }
        return machineId
    }

    validateTaskDependencies(
        projectId: string,
        taskId: string | null,
        dependsOn: string[],
    ): string[] {
        const normalized = Array.from(new Set(dependsOn.filter((value) => value.trim().length > 0)))
        for (const dependencyId of normalized) {
            if (taskId && dependencyId === taskId) {
                throw new TeamOrchestrationError(
                    'Team task cannot depend on itself',
                    'team_task_dependency_invalid',
                    400,
                )
            }
            const dependency = this.store.teams.getTask(dependencyId)
            if (!dependency || dependency.projectId !== projectId) {
                throw new TeamOrchestrationError(
                    'Team task dependency is invalid',
                    'team_task_dependency_invalid',
                    400,
                )
            }
        }

        return normalized
    }

    listOpenTaskReferences(projectId: string, memberId: string): TeamTaskRecord[] {
        return this.store.teams
            .listProjectTasks(projectId)
            .filter((task) =>
                !isTerminalTeamTaskStatus(task.status)
                && (task.assigneeMemberId === memberId
                    || task.reviewerMemberId === memberId
                    || task.verifierMemberId === memberId)
            )
    }

    listRoleMembers(projectId: string, roleId: string): TeamMemberRecord[] {
        return this.store.teams
            .listProjectMembers(projectId)
            .filter((member) => member.roleId === roleId)
    }

    requireProjectClosable(projectId: string, managerSessionId: string): TeamProjectSnapshot {
        const snapshot = requireActiveProjectOwnedByManagerSnapshot(this.store, projectId, managerSessionId)
        if (!isProjectReadyToDeliver(snapshot.project, snapshot.tasks, snapshot.acceptance)) {
            throw new TeamOrchestrationError(
                'Project still has unresolved team tasks or pending acceptance',
                'team_project_close_blocked',
                409,
            )
        }
        return snapshot
    }

    requireProjectBootstrapImportTarget(
        projectId: string,
        managerSessionId: string,
    ): TeamProjectSnapshot {
        const snapshot = requireActiveProjectOwnedByManagerSnapshot(this.store, projectId, managerSessionId)
        if (snapshot.members.length > 0 || snapshot.tasks.length > 0) {
            throw new TeamOrchestrationError(
                'Team preset import is only allowed before member or task orchestration begins',
                'team_preset_bootstrap_required',
                409,
            )
        }

        return snapshot
    }

    private requireActiveMember(
        memberId: string,
        managerSessionId: string,
    ): TeamMemberRecord {
        const member = this.requireMember(memberId, managerSessionId)
        if (member.membershipState !== 'active') {
            throw new TeamOrchestrationError('Team member is not active', 'team_member_inactive', 409)
        }

        return member
    }
}
