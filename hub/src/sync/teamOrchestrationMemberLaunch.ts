import { randomUUID } from 'node:crypto'
import type {
    TeamMemberRecord,
    TeamProject,
    TeamRoleDefinition,
    TeamTaskRecord,
} from '@viby/protocol/types'
import {
    compactSessionIds,
    getRequiredProjectSnapshot,
    resolveActor,
    type ResolvedMemberConfig,
    type TeamOrchestrationRuntime,
} from './teamOrchestrationCommon'
import type { InactiveTeamMemberLaunchPlan } from './teamMemberSessionService'
import {
    TeamOrchestrationError,
    type SpawnTeamMemberInput,
    type TeamMemberActionResult,
} from './teamOrchestrationContracts'
import { buildReplacementTaskUpdates } from './teamOrchestrationMemberSupport'
import {
    appendLaunchMessages,
    cleanupFailedSpawn,
} from './teamOrchestrationMemberSessionSupport'
import { createTeamEventRecord } from './teamOrchestrationRecords'

export type MemberLaunchOptions = {
    managerSessionId: string
    project: TeamProject
    role: TeamRoleDefinition
    task: TeamTaskRecord | null
    instruction?: string | null
    input: SpawnTeamMemberInput
    config: ResolvedMemberConfig
    plan: InactiveTeamMemberLaunchPlan
    replacementSource?: TeamMemberRecord
}

export async function executeMemberLaunch(
    runtime: TeamOrchestrationRuntime,
    options: MemberLaunchOptions,
): Promise<TeamMemberActionResult> {
    if (options.plan.strategy === 'resume') {
        return await resumeExistingMember(runtime, {
            ...options,
            plan: options.plan,
        })
    }

    return await spawnNewMember(runtime, {
        ...options,
        plan: options.plan,
    })
}

async function resumeExistingMember(
    runtime: TeamOrchestrationRuntime,
    options: MemberLaunchOptions & {
        plan: Extract<InactiveTeamMemberLaunchPlan, { strategy: 'resume' }>
    },
): Promise<TeamMemberActionResult> {
    const actor = resolveActor(options.managerSessionId)
    await runtime.lifecycleService.unarchiveSessionWithActor(options.plan.candidate.member.sessionId, actor)
    const currentMember = runtime.contextReader.requireMember(options.plan.candidate.member.id, options.managerSessionId)
    const now = Date.now()
    const nextMember: TeamMemberRecord = {
        ...currentMember,
        controlOwner: 'manager',
        membershipState: 'active',
        providerFlavor: options.config.providerFlavor,
        model: options.config.model,
        reasoningEffort: options.config.reasoningEffort,
        isolationMode: options.config.isolationMode,
        workspaceRoot: options.config.requestedWorkspaceRoot,
        spawnedForTaskId: options.task?.id ?? currentMember.spawnedForTaskId,
        updatedAt: now,
        archivedAt: null,
    }
    const changed = JSON.stringify(nextMember) !== JSON.stringify(currentMember)
    const result = changed
        ? runtime.coordinator.applyCommand({
            type: 'upsert-member',
            member: nextMember,
            affectedSessionIds: [options.managerSessionId, nextMember.sessionId],
        })
        : {
            projectId: options.project.id,
            managerSessionId: options.managerSessionId,
            affectedSessionIds: [options.managerSessionId, nextMember.sessionId],
            snapshot: getRequiredProjectSnapshot(runtime, options.project.id),
        }
    const session = await appendLaunchMessages(runtime, nextMember, {
        task: options.task,
        instruction: options.instruction,
    })

    return {
        member: nextMember,
        snapshot: result.snapshot,
        session,
        launch: {
            strategy: 'resume',
            reason: options.plan.reason,
            previousMemberId: nextMember.id,
        },
    }
}

async function spawnNewMember(
    runtime: TeamOrchestrationRuntime,
    options: MemberLaunchOptions & {
        plan: Exclude<InactiveTeamMemberLaunchPlan, { strategy: 'resume' }>
    },
): Promise<TeamMemberActionResult> {
    const sourceMember = options.replacementSource ?? options.plan.candidate?.member ?? null
    const memberId = randomUUID()
    const sessionId = randomUUID()
    const createdAt = Date.now()
    const revision = sourceMember ? sourceMember.revision + 1 : 1
    const provisionalMember: TeamMemberRecord = {
        id: memberId,
        projectId: options.project.id,
        sessionId,
        managerSessionId: options.managerSessionId,
        role: options.role.prototype,
        roleId: options.role.id,
        providerFlavor: options.config.providerFlavor,
        model: options.config.model,
        reasoningEffort: options.config.reasoningEffort,
        isolationMode: options.config.isolationMode,
        workspaceRoot: options.config.initialWorkspaceRoot,
        controlOwner: 'manager',
        membershipState: 'active',
        revision,
        supersedesMemberId: sourceMember?.id ?? null,
        supersededByMemberId: null,
        spawnedForTaskId: options.task?.id ?? sourceMember?.spawnedForTaskId ?? null,
        createdAt,
        updatedAt: createdAt,
        archivedAt: null,
        removedAt: null,
    }
    runtime.store.sessions.getOrCreateSession({
        tag: `team-member-${memberId}`,
        sessionId,
        metadata: {
            path: options.config.directory,
            host: 'localhost',
            machineId: runtime.contextReader.resolveProjectMachineId(options.project),
            flavor: options.config.providerFlavor,
        },
        agentState: null,
        model: options.config.model ?? undefined,
        modelReasoningEffort: options.config.reasoningEffort ?? undefined,
        permissionMode: options.input.permissionMode,
        collaborationMode: options.input.collaborationMode,
    })

    runtime.coordinator.applyCommand({
        type: 'upsert-member',
        member: provisionalMember,
        event: createTeamEventRecord(options.project.id, 'member', {
            kind: 'member-spawned',
            actorType: 'manager',
            actorId: options.managerSessionId,
            targetId: provisionalMember.id,
            payload: {
                strategy: options.plan.strategy,
                reason: options.plan.reason,
                sourceMemberId: sourceMember?.id ?? null,
                taskId: provisionalMember.spawnedForTaskId,
            },
            createdAt,
        }),
        affectedSessionIds: [options.managerSessionId, provisionalMember.sessionId],
    })

    const spawnResult = await runtime.spawnSession({
        sessionId,
        machineId: runtime.contextReader.resolveProjectMachineId(options.project),
        directory: options.config.directory,
        agent: options.config.providerFlavor ?? undefined,
        model: options.config.model ?? undefined,
        modelReasoningEffort: options.config.reasoningEffort,
        permissionMode: options.input.permissionMode,
        collaborationMode: options.input.collaborationMode,
        sessionRole: 'normal',
        sessionType: options.config.sessionType,
        worktreeName: options.config.worktreeName,
    })
    if (spawnResult.type !== 'success') {
        cleanupFailedSpawn(runtime, provisionalMember, options.managerSessionId, spawnResult.message)
        throw new TeamOrchestrationError(spawnResult.message, 'team_member_spawn_failed', 409)
    }

    const session = runtime.getSession(sessionId)
    if (!session) {
        cleanupFailedSpawn(runtime, provisionalMember, options.managerSessionId, 'Session snapshot unavailable after spawn')
        throw new TeamOrchestrationError(
            'Session snapshot unavailable after spawn',
            'team_member_spawn_failed',
            409,
        )
    }

    const actualWorkspaceRoot = session.metadata?.path ?? provisionalMember.workspaceRoot
    const finalizedMember: TeamMemberRecord = {
        ...provisionalMember,
        workspaceRoot: actualWorkspaceRoot ?? provisionalMember.workspaceRoot,
        updatedAt: Date.now(),
    }
    const nextMembers = [finalizedMember]
    const nextTasks = sourceMember
        ? buildReplacementTaskUpdates(runtime, options.project.id, sourceMember.id, finalizedMember.id)
        : []
    const events = []
    if (sourceMember) {
        nextMembers.push({
            ...sourceMember,
            membershipState: 'superseded',
            supersededByMemberId: finalizedMember.id,
            updatedAt: Date.now(),
        })
        events.push(createTeamEventRecord(options.project.id, 'member', {
            kind: 'member-replaced',
            actorType: 'manager',
            actorId: options.managerSessionId,
            targetId: finalizedMember.id,
            payload: {
                supersedesMemberId: sourceMember.id,
                strategy: options.plan.strategy,
                reason: options.plan.reason,
            },
            createdAt: Date.now(),
        }))
    }

    const result = runtime.coordinator.applyCommand({
        type: 'batch',
        members: nextMembers,
        tasks: nextTasks,
        events,
        affectedSessionIds: compactSessionIds([
            options.managerSessionId,
            finalizedMember.sessionId,
            sourceMember?.sessionId,
            ...nextTasks.map((task) => task.assigneeMemberId ? runtime.store.teams.getMember(task.assigneeMemberId)?.sessionId : null),
        ]),
    })

    if (sourceMember && options.plan.strategy === 'revision') {
        await runtime.appendInternalUserMessage(
            finalizedMember.sessionId,
            runtime.memberSessionService.buildRevisionCarryoverMessage({
                projectId: options.project.id,
                managerSessionId: options.managerSessionId,
                memberId: finalizedMember.id,
                plan: {
                    strategy: 'revision',
                    reason: options.plan.reason,
                    candidate: options.plan.candidate,
                },
                taskGoal: options.input.taskGoal,
                artifactSummary: options.input.artifactSummary,
                attemptSummary: options.input.attemptSummary,
                failureSummary: options.input.failureSummary,
                reviewSummary: options.input.reviewSummary,
                filePointers: options.input.filePointers,
            }),
        )
    }

    const launchedSession = await appendLaunchMessages(runtime, finalizedMember, {
        task: options.task,
        instruction: options.instruction,
    })

    return {
        member: finalizedMember,
        snapshot: result.snapshot,
        session: launchedSession,
        launch: {
            strategy: options.plan.strategy,
            reason: options.plan.reason,
            previousMemberId: sourceMember?.id ?? null,
        },
    }
}
