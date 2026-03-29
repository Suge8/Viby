import { isTerminalTeamTaskStatus } from '@viby/protocol'
import type {
    MessageMeta,
    TeamControlOwner,
    TeamMessageKind,
    TeamMemberRecord,
    TeamProjectCompactStaffing,
    TeamProjectSnapshot,
    TeamProjectStaffingHint,
    TeamRoleDefinition,
    TeamTaskRecord,
} from '@viby/protocol/types'
import type { Store } from '../store'
import {
    buildRevisionCarryoverBrief,
    canResumeCandidate,
    compareLaunchCandidates,
    parseLaunchSession,
    REUSABLE_MEMBER_STATES,
    resolveRevisionReason,
    type InactiveTeamMemberLaunchCandidate,
    type InactiveTeamMemberLaunchPlan,
    type InactiveTeamMemberLaunchRequest,
    type RevisionCarryoverBriefInput,
} from './teamMemberSessionPolicy'
import { TeamOrchestrationError } from './teamOrchestrationContracts'

export type {
    InactiveTeamMemberLaunchCandidate,
    InactiveTeamMemberLaunchPlan,
    InactiveTeamMemberLaunchReason,
    InactiveTeamMemberLaunchRequest,
    RevisionCarryoverBriefInput,
} from './teamMemberSessionPolicy'
export { buildRevisionCarryoverBrief } from './teamMemberSessionPolicy'

export type RevisionCarryoverMessageInput = RevisionCarryoverBriefInput & {
    projectId: string
    managerSessionId: string
    memberId: string
    controlOwner?: TeamControlOwner
    teamMessageKind?: TeamMessageKind
}

const DEFAULT_TEAM_MESSAGE_KIND: TeamMessageKind = 'coordination'
const DEFAULT_CONTROL_OWNER: TeamControlOwner = 'manager'
const LIMITED_MEMBER_SLOT_COUNT = 1
const MAX_PROJECT_STAFFING_HINTS = 6

type StaffingTaskTarget = {
    task: TeamTaskRecord
    role: TeamRoleDefinition
    member: TeamMemberRecord | null
}

function buildMemberMap(members: readonly TeamMemberRecord[]): Map<string, TeamMemberRecord> {
    return new Map(members.map((member) => [member.id, member]))
}

function buildRoleMap(roles: readonly TeamRoleDefinition[]): Map<string, TeamRoleDefinition> {
    return new Map(roles.map((role) => [role.id, role]))
}

function countActiveMembers(members: readonly TeamMemberRecord[]): number {
    return members.filter((member) => member.membershipState === 'active').length
}

function resolveSeatPressure(
    remainingMemberSlots: number
): TeamProjectCompactStaffing['seatPressure'] {
    if (remainingMemberSlots === 0) {
        return 'at_capacity'
    }
    if (remainingMemberSlots === LIMITED_MEMBER_SLOT_COUNT) {
        return 'limited'
    }

    return 'available'
}

function resolveLaunchSeatDelta(plan: InactiveTeamMemberLaunchPlan): number {
    if (plan.strategy === 'spawn') {
        return 1
    }

    const membershipState = plan.candidate.member.membershipState
    if (plan.strategy === 'resume') {
        return membershipState === 'archived' ? 1 : 0
    }

    return membershipState === 'active' ? 0 : 1
}

function buildStaffingLaunchRequest(
    projectId: string,
    rootDirectory: string | null,
    target: StaffingTaskTarget
): InactiveTeamMemberLaunchRequest {
    return {
        projectId,
        roleId: target.role.id,
        providerFlavor: target.member?.providerFlavor ?? target.role.providerFlavor,
        isolationMode: target.member?.isolationMode ?? target.role.isolationMode,
        workspaceRoot: target.member?.workspaceRoot ?? rootDirectory,
        contextTrusted: true,
        workspaceTrusted: true,
    }
}

function pushStaffingHint(
    target: TeamProjectStaffingHint[],
    hint: TeamProjectStaffingHint
): void {
    const duplicate = target.some((candidate) =>
        candidate.kind === hint.kind
        && candidate.taskId === hint.taskId
        && candidate.roleId === hint.roleId
        && candidate.memberId === hint.memberId
        && candidate.candidateMemberId === hint.candidateMemberId
    )
    if (!duplicate) {
        target.push(hint)
    }
}

export class TeamMemberSessionService {
    constructor(private readonly store: Store) {
    }

    planInactiveLaunch(request: InactiveTeamMemberLaunchRequest): InactiveTeamMemberLaunchPlan {
        const candidates = this.listInactiveCandidates(request.projectId, request.roleId)
        const resumeCandidate = candidates.find((candidate) => canResumeCandidate(candidate, request))
        if (resumeCandidate) {
            return {
                strategy: 'resume',
                reason: 'resume_supported',
                candidate: resumeCandidate
            }
        }

        const latestCandidate = candidates[0]
        if (!latestCandidate) {
            return {
                strategy: 'spawn',
                reason: 'no_prior_member',
                candidate: null
            }
        }

        return {
            strategy: 'revision',
            reason: resolveRevisionReason(latestCandidate, request),
            candidate: latestCandidate
        }
    }

    buildRevisionCarryoverMessage(input: RevisionCarryoverMessageInput): {
        text: string
        meta: MessageMeta
    } {
        const brief = buildRevisionCarryoverBrief(input)

        return {
            text: brief,
            meta: {
                sentFrom: 'manager',
                teamProjectId: input.projectId,
                managerSessionId: input.managerSessionId,
                memberId: input.memberId,
                sessionRole: 'member',
                teamMessageKind: input.teamMessageKind ?? DEFAULT_TEAM_MESSAGE_KIND,
                controlOwner: input.controlOwner ?? DEFAULT_CONTROL_OWNER
            }
        }
    }

    getLatestReusableRoleMember(
        projectId: string,
        roleId: string
    ): TeamMemberRecord | null {
        return this.listInactiveCandidates(projectId, roleId)[0]?.member ?? null
    }

    ensureProjectMemberCapacity(
        snapshot: Pick<TeamProjectSnapshot, 'project' | 'members'>,
        plan: InactiveTeamMemberLaunchPlan
    ): void {
        const activeMemberCount = countActiveMembers(snapshot.members)
        const delta = resolveLaunchSeatDelta(plan)
        if (activeMemberCount + delta > snapshot.project.maxActiveMembers) {
            throw new TeamOrchestrationError(
                'Manager project has reached the active member limit',
                'team_member_capacity_reached',
                409
            )
        }
    }

    buildProjectStaffing(
        snapshot: Pick<TeamProjectSnapshot, 'project' | 'roles' | 'members' | 'tasks'>
    ): TeamProjectCompactStaffing {
        const activeMemberCount = countActiveMembers(snapshot.members)
        const remainingMemberSlots = Math.max(snapshot.project.maxActiveMembers - activeMemberCount, 0)
        const seatPressure = resolveSeatPressure(remainingMemberSlots)
        const hints: TeamProjectStaffingHint[] = []
        const membersById = buildMemberMap(snapshot.members)
        const rolesById = buildRoleMap(snapshot.roles)

        for (const target of this.listStaffingTaskTargets(snapshot.tasks, membersById, rolesById)) {
            const plan = this.planInactiveLaunch(
                buildStaffingLaunchRequest(snapshot.project.id, snapshot.project.rootDirectory, target)
            )
            const priority = target.task.status === 'blocked' ? 'high' : 'medium'

            if (plan.strategy === 'resume') {
                pushStaffingHint(hints, {
                    kind: 'reuse-existing-lineage',
                    priority,
                    summary: `Task "${target.task.title}" can reuse inactive ${target.role.name} lineage via resume.`,
                    taskId: target.task.id,
                    roleId: target.role.id,
                    memberId: target.member?.id ?? null,
                    candidateMemberId: plan.candidate.member.id,
                    launchStrategy: 'resume',
                })
                continue
            }

            if (plan.strategy === 'revision') {
                pushStaffingHint(hints, {
                    kind: 'replace-current-member',
                    priority,
                    summary: `Task "${target.task.title}" likely needs a fresh ${target.role.name} revision before it can progress.`,
                    taskId: target.task.id,
                    roleId: target.role.id,
                    memberId: target.member?.id ?? null,
                    candidateMemberId: plan.candidate.member.id,
                    launchStrategy: 'revision',
                })
                continue
            }

            pushStaffingHint(hints, {
                kind: seatPressure === 'at_capacity' ? 'free-capacity' : 'spawn-new-member',
                priority,
                summary: seatPressure === 'at_capacity'
                    ? `Task "${target.task.title}" may need another ${target.role.name}, but the active member cap is full.`
                    : `Task "${target.task.title}" may need a new ${target.role.name} member to keep moving.`,
                taskId: target.task.id,
                roleId: target.role.id,
                memberId: target.member?.id ?? null,
                candidateMemberId: null,
                launchStrategy: 'spawn',
            })
        }

        return {
            seatPressure,
            remainingMemberSlots,
            hints: hints.slice(0, MAX_PROJECT_STAFFING_HINTS)
        }
    }

    private listInactiveCandidates(
        projectId: string,
        roleId: string
    ): InactiveTeamMemberLaunchCandidate[] {
        return this.store.teams
            .listProjectMembers(projectId)
            .filter((member) =>
                member.roleId === roleId
                && REUSABLE_MEMBER_STATES.has(member.membershipState)
            )
            .map((member) => ({
                member,
                session: parseLaunchSession(this.store.sessions.getSession(member.sessionId))
            }))
            .filter((candidate) => candidate.session?.active !== true)
            .sort(compareLaunchCandidates)
    }

    private listStaffingTaskTargets(
        tasks: readonly TeamTaskRecord[],
        membersById: Map<string, TeamMemberRecord>,
        rolesById: Map<string, TeamRoleDefinition>
    ): StaffingTaskTarget[] {
        const targets: StaffingTaskTarget[] = []

        for (const task of tasks) {
            if (isTerminalTeamTaskStatus(task.status)) {
                continue
            }

            const target = this.resolveStaffingTaskTarget(task, membersById, rolesById)
            if (target) {
                targets.push(target)
            }
        }

        return targets
    }

    private resolveStaffingTaskTarget(
        task: TeamTaskRecord,
        membersById: Map<string, TeamMemberRecord>,
        rolesById: Map<string, TeamRoleDefinition>
    ): StaffingTaskTarget | null {
        if (task.status === 'blocked') {
            const member = task.assigneeMemberId ? membersById.get(task.assigneeMemberId) ?? null : null
            const role = member ? rolesById.get(member.roleId) ?? null : null
            return role ? { task, role, member } : null
        }

        if (task.status === 'in_review') {
            const member = task.reviewerMemberId ? membersById.get(task.reviewerMemberId) ?? null : null
            const role = rolesById.get(member?.roleId ?? 'reviewer') ?? null
            return role ? { task, role, member } : null
        }

        if (task.status === 'in_verification') {
            const member = task.verifierMemberId ? membersById.get(task.verifierMemberId) ?? null : null
            const role = rolesById.get(member?.roleId ?? 'verifier') ?? null
            return role ? { task, role, member } : null
        }

        return null
    }
}
