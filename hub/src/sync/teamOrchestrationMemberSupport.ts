import { randomUUID } from 'node:crypto'
import type {
    TeamMemberIsolationMode,
    TeamMemberRecord,
    TeamProject,
    TeamProviderFlavor,
    TeamReasoningEffort,
    TeamRoleDefinition,
    TeamTaskRecord,
} from '@viby/protocol/types'
import {
    parseLaunchSession,
    resolveRevisionReason,
} from './teamMemberSessionPolicy'
import type {
    InactiveTeamMemberLaunchPlan,
    InactiveTeamMemberLaunchRequest,
} from './teamMemberSessionService'
import {
    isTaskTerminal,
    type ResolvedMemberConfig,
    type TeamOrchestrationRuntime,
} from './teamOrchestrationCommon'
import type { SpawnTeamMemberInput } from './teamOrchestrationContracts'
import { normalizeOptionalText } from './teamOrchestrationMessages'

type SpawnMemberConfigInput = SpawnTeamMemberInput & {
    task: TeamTaskRecord | null
    sourceMember: TeamMemberRecord | null
}

function resolveIsolationMode(
    project: TeamProject,
    role: TeamRoleDefinition,
    override: TeamMemberIsolationMode | undefined,
    sourceMember: TeamMemberRecord | null,
): TeamMemberIsolationMode {
    if (override) {
        return override
    }
    if (sourceMember?.isolationMode) {
        return sourceMember.isolationMode
    }
    if (project.defaultIsolationMode === 'all_simple') {
        return 'simple'
    }

    return role.isolationMode
}

function resolveProviderFlavor(
    role: TeamRoleDefinition,
    override: TeamProviderFlavor | null | undefined,
    sourceMember: TeamMemberRecord | null,
): TeamProviderFlavor | null {
    if (override !== undefined) {
        return override
    }
    if (sourceMember) {
        return sourceMember.providerFlavor
    }

    return role.providerFlavor
}

function resolveModel(
    role: TeamRoleDefinition,
    override: string | null | undefined,
    sourceMember: TeamMemberRecord | null,
): string | null {
    if (override !== undefined) {
        return normalizeOptionalText(override)
    }
    if (sourceMember) {
        return sourceMember.model
    }

    return role.model
}

function resolveReasoningEffort(
    role: TeamRoleDefinition,
    override: TeamReasoningEffort | null | undefined,
    sourceMember: TeamMemberRecord | null,
): TeamReasoningEffort | null {
    if (override !== undefined) {
        return override
    }
    if (sourceMember) {
        return sourceMember.reasoningEffort
    }

    return role.reasoningEffort
}

function resolveRequestedWorkspaceRoot(
    runtime: TeamOrchestrationRuntime,
    project: TeamProject,
    prototype: TeamRoleDefinition['prototype'],
    task: TeamTaskRecord | null,
    sourceMember: TeamMemberRecord | null,
): string | null {
    if ((prototype === 'reviewer' || prototype === 'verifier') && task?.assigneeMemberId) {
        const assignee = runtime.store.teams.getMember(task.assigneeMemberId)
        if (assignee?.workspaceRoot) {
            return assignee.workspaceRoot
        }
    }
    if (sourceMember?.workspaceRoot) {
        return sourceMember.workspaceRoot
    }

    return runtime.contextReader.resolveProjectRoot(project)
}

export function resolveMemberConfig(
    runtime: TeamOrchestrationRuntime,
    project: TeamProject,
    role: TeamRoleDefinition,
    input: SpawnMemberConfigInput,
): ResolvedMemberConfig {
    const isolationMode = resolveIsolationMode(project, role, input.isolationMode, input.sourceMember)
    const requestedWorkspaceRoot = resolveRequestedWorkspaceRoot(
        runtime,
        project,
        role.prototype,
        input.task,
        input.sourceMember,
    )
    const providerFlavor = resolveProviderFlavor(role, input.providerFlavor, input.sourceMember)
    const model = resolveModel(role, input.model, input.sourceMember)
    const reasoningEffort = resolveReasoningEffort(role, input.reasoningEffort, input.sourceMember)
    const directory = isolationMode === 'worktree'
        ? runtime.contextReader.resolveProjectRoot(project)
        : requestedWorkspaceRoot ?? runtime.contextReader.resolveProjectRoot(project)

    return {
        providerFlavor,
        model,
        reasoningEffort,
        isolationMode,
        requestedWorkspaceRoot,
        initialWorkspaceRoot: requestedWorkspaceRoot,
        directory,
        sessionType: isolationMode === 'worktree' ? 'worktree' : 'simple',
        worktreeName: isolationMode === 'worktree'
            ? `${role.id}-${randomUUID().slice(0, 8)}`
            : undefined,
    }
}

export function buildLaunchRequest(
    projectId: string,
    roleId: string,
    input: SpawnTeamMemberInput,
    config: ResolvedMemberConfig,
): InactiveTeamMemberLaunchRequest {
    return {
        projectId,
        roleId,
        providerFlavor: config.providerFlavor,
        isolationMode: config.isolationMode,
        workspaceRoot: config.requestedWorkspaceRoot,
        contextTrusted: input.contextTrusted ?? true,
        workspaceTrusted: input.workspaceTrusted ?? true,
        requireFreshPerspective: input.requireFreshPerspective,
    }
}

export function buildForcedRevisionPlan(
    runtime: TeamOrchestrationRuntime,
    launchRequest: InactiveTeamMemberLaunchRequest,
    archivedSource: TeamMemberRecord,
): Extract<InactiveTeamMemberLaunchPlan, { strategy: 'revision' }> {
    return {
        strategy: 'revision',
        reason: resolveRevisionReason({
            member: archivedSource,
            session: parseLaunchSession(runtime.store.sessions.getSession(archivedSource.sessionId)),
        }, launchRequest),
        candidate: {
            member: archivedSource,
            session: parseLaunchSession(runtime.store.sessions.getSession(archivedSource.sessionId)),
        },
    }
}

export function resumeWouldDriftSessionConfig(
    plan: Extract<InactiveTeamMemberLaunchPlan, { strategy: 'resume' }>,
    config: ResolvedMemberConfig,
): boolean {
    return plan.candidate.member.model !== config.model
        || plan.candidate.member.reasoningEffort !== config.reasoningEffort
}

export function buildReplacementTaskUpdates(
    runtime: TeamOrchestrationRuntime,
    projectId: string,
    fromMemberId: string,
    toMemberId: string,
): TeamTaskRecord[] {
    const now = Date.now()
    return runtime.store.teams
        .listProjectTasks(projectId)
        .filter((task) => !isTaskTerminal(task.status))
        .map((task) => {
            const nextTask: TeamTaskRecord = {
                ...task,
                assigneeMemberId: task.assigneeMemberId === fromMemberId ? toMemberId : task.assigneeMemberId,
                reviewerMemberId: task.reviewerMemberId === fromMemberId ? toMemberId : task.reviewerMemberId,
                verifierMemberId: task.verifierMemberId === fromMemberId ? toMemberId : task.verifierMemberId,
                updatedAt: now,
            }

            return nextTask
        })
}
