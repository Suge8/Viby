import type {
    MessageTeamMemberInput,
    SpawnTeamMemberInput,
    TeamMemberActionResult,
    TeamMemberUpdateResult,
    UpdateTeamMemberInput,
} from './teamOrchestrationContracts'
import {
    DEFAULT_DIRECT_MESSAGE_KIND,
    resolveActor,
    type TeamOrchestrationRuntime,
} from './teamOrchestrationCommon'
import { executeMemberLaunch } from './teamOrchestrationMemberLaunch'
import {
    buildForcedRevisionPlan,
    buildLaunchRequest,
    resolveMemberConfig,
    resumeWouldDriftSessionConfig,
} from './teamOrchestrationMemberSupport'
import {
    buildDirectMessageText,
    buildMemberMeta,
} from './teamOrchestrationMessages'
import { TeamOrchestrationError } from './teamOrchestrationContracts'
import { createTeamEventRecord } from './teamOrchestrationRecords'

function requireMemberRoleDefinition(
    runtime: TeamOrchestrationRuntime,
    managerSessionId: string,
    projectId: string,
    roleId: string,
    prototype: string,
) {
    const role = runtime.contextReader.requireProjectRole(projectId, managerSessionId, roleId)
    if (role.prototype !== prototype) {
        throw new TeamOrchestrationError(
            'Team role definition no longer matches the member prototype lineage',
            'team_role_definition_drift',
            409,
        )
    }

    return role
}

export async function spawnMember(
    runtime: TeamOrchestrationRuntime,
    input: SpawnTeamMemberInput,
): Promise<TeamMemberActionResult> {
    const snapshot = runtime.contextReader.requireActiveManagerProject(input.managerSessionId)
    const role = runtime.contextReader.requireProjectRole(
        snapshot.project.id,
        input.managerSessionId,
        input.roleId,
    )
    const task = input.taskId
        ? runtime.contextReader.requireSpawnTask(input.taskId, input.managerSessionId)
        : null
    const sourceMember = runtime.memberSessionService.getLatestReusableRoleMember(
        snapshot.project.id,
        role.id
    )
    const config = resolveMemberConfig(runtime, snapshot.project, role, {
        ...input,
        task,
        sourceMember,
    })
    let plan = runtime.memberSessionService.planInactiveLaunch(
        buildLaunchRequest(snapshot.project.id, role.id, input, config),
    )
    if (plan.strategy === 'resume' && resumeWouldDriftSessionConfig(plan, config)) {
        plan = runtime.memberSessionService.planInactiveLaunch({
            ...buildLaunchRequest(snapshot.project.id, role.id, input, config),
            requireFreshPerspective: true,
        })
    }

    runtime.memberSessionService.ensureProjectMemberCapacity(snapshot, plan)
    return await executeMemberLaunch(runtime, {
        managerSessionId: input.managerSessionId,
        project: snapshot.project,
        role,
        task,
        instruction: input.instruction,
        input,
        config,
        plan,
    })
}

export async function updateMember(
    runtime: TeamOrchestrationRuntime,
    input: UpdateTeamMemberInput,
): Promise<TeamMemberUpdateResult> {
    if (input.action === 'remove') {
        return await removeMember(runtime, input)
    }

    const member = runtime.contextReader.requireMember(input.memberId, input.managerSessionId)
    await runtime.lifecycleService.archiveSessionWithActor(member.sessionId, resolveActor(input.managerSessionId))

    const archivedSource = runtime.contextReader.requireMember(input.memberId, input.managerSessionId)
    const snapshot = runtime.contextReader.requireActiveManagerProject(input.managerSessionId)
    const role = requireMemberRoleDefinition(
        runtime,
        input.managerSessionId,
        snapshot.project.id,
        archivedSource.roleId,
        archivedSource.role,
    )
    const task = input.taskId
        ? runtime.contextReader.requireSpawnTask(input.taskId, input.managerSessionId)
        : (archivedSource.spawnedForTaskId
            ? runtime.store.teams.getTask(archivedSource.spawnedForTaskId)
            : null)
    const config = resolveMemberConfig(runtime, snapshot.project, role, {
        ...input,
        roleId: archivedSource.roleId,
        task,
        sourceMember: archivedSource,
    })
    const launchRequest = buildLaunchRequest(snapshot.project.id, role.id, {
        ...input,
        managerSessionId: input.managerSessionId,
        roleId: archivedSource.roleId,
        requireFreshPerspective: input.requireFreshPerspective ?? true,
    }, config)
    const plan = buildForcedRevisionPlan(runtime, launchRequest, archivedSource)

    const result = await executeMemberLaunch(runtime, {
        managerSessionId: input.managerSessionId,
        project: snapshot.project,
        role,
        task,
        instruction: input.instruction,
        input: {
            ...input,
            managerSessionId: input.managerSessionId,
            roleId: archivedSource.roleId,
        },
        config,
        plan,
        replacementSource: archivedSource,
    })

    return {
        action: 'replace',
        member: result.member,
        snapshot: result.snapshot,
        session: result.session,
        launch: result.launch,
        replacedMemberId: archivedSource.id,
    }
}

export async function messageMember(
    runtime: TeamOrchestrationRuntime,
    input: MessageTeamMemberInput,
): Promise<TeamMemberActionResult> {
    const member = runtime.contextReader.requireActiveManagerControlledMember(input.memberId, input.managerSessionId)
    const text = buildDirectMessageText(input.text)
    if (!text) {
        throw new TeamOrchestrationError('Message text is required', 'team_message_empty', 400)
    }

    const result = runtime.coordinator.applyCommand({
        type: 'record-event',
        event: createTeamEventRecord(member.projectId, 'member', {
            kind: 'direct-message-sent',
            actorType: 'manager',
            actorId: input.managerSessionId,
            targetId: member.id,
            payload: {
                messageKind: input.kind ?? DEFAULT_DIRECT_MESSAGE_KIND,
                text,
            },
            createdAt: Date.now(),
        }),
        affectedSessionIds: [input.managerSessionId, member.sessionId],
    })
    const session = await runtime.appendInternalUserMessage(member.sessionId, {
        text,
        meta: buildMemberMeta(member, input.kind ?? DEFAULT_DIRECT_MESSAGE_KIND),
    })

    return {
        member,
        snapshot: result.snapshot,
        session,
        launch: {
            strategy: 'resume',
            reason: 'direct_message_sent',
            previousMemberId: member.id,
        },
    }
}

async function removeMember(
    runtime: TeamOrchestrationRuntime,
    input: Extract<UpdateTeamMemberInput, { action: 'remove' }>,
): Promise<TeamMemberUpdateResult> {
    const member = runtime.contextReader.requireMember(input.memberId, input.managerSessionId)
    const blockingTasks = runtime.contextReader.listOpenTaskReferences(member.projectId, member.id)
    if (blockingTasks.length > 0) {
        throw new TeamOrchestrationError(
            'Member still owns open team tasks and must be reassigned first',
            'team_member_remove_blocked',
            409,
        )
    }

    await runtime.lifecycleService.archiveSessionWithActor(member.sessionId, resolveActor(input.managerSessionId))
    const archivedMember = runtime.contextReader.requireMember(input.memberId, input.managerSessionId)
    const now = Date.now()
    const nextMember = {
        ...archivedMember,
        controlOwner: 'manager' as const,
        membershipState: 'removed' as const,
        updatedAt: now,
        removedAt: archivedMember.removedAt ?? now,
    }
    const result = runtime.coordinator.applyCommand({
        type: 'upsert-member',
        member: nextMember,
        event: createTeamEventRecord(nextMember.projectId, 'member', {
            kind: 'member-removed',
            actorType: 'manager',
            actorId: input.managerSessionId,
            targetId: nextMember.id,
            payload: null,
            createdAt: now,
        }),
        affectedSessionIds: [input.managerSessionId, nextMember.sessionId],
    })

    return {
        action: 'remove',
        member: nextMember,
        snapshot: result.snapshot,
    }
}
