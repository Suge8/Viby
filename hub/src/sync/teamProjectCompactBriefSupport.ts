import {
    getTeamRoleDisplayName,
    isProjectReadyToDeliver as isProjectReadyToDeliverContract,
    isTaskReadyForManagerAcceptance as isTaskReadyForManagerAcceptanceContract,
} from '@viby/protocol'
import type {
    TeamProjectCompactCounts,
    TeamEventRecord,
    TeamMemberRecord,
    TeamProject,
    TeamProjectAcceptanceReadModel,
    TeamProjectCompactBrief,
    TeamProjectCompactEvent,
    TeamProjectCompactStaffing,
    TeamRoleDefinition,
    TeamTaskAcceptanceRecord,
    TeamTaskRecord,
} from '@viby/protocol/types'

export type TeamProjectCompactBriefSource = {
    project: TeamProject
    roles: readonly TeamRoleDefinition[]
    members: readonly TeamMemberRecord[]
    tasks: readonly TeamTaskRecord[]
    events: readonly TeamEventRecord[]
    acceptance: TeamProjectAcceptanceReadModel
    staffing: TeamProjectCompactStaffing
}

export function buildRoleNameMap(roles: readonly TeamRoleDefinition[]): Map<string, string> {
    return new Map(roles.map((role) => [role.id, role.name]))
}

export function buildMemberMap(members: readonly TeamMemberRecord[]): Map<string, TeamMemberRecord> {
    return new Map(members.map((member) => [member.id, member]))
}

export function buildTaskMap(tasks: readonly TeamTaskRecord[]): Map<string, TeamTaskRecord> {
    return new Map(tasks.map((task) => [task.id, task]))
}

export function formatEventKind(kind: TeamEventRecord['kind']): string {
    return kind.replace(/-/g, ' ')
}

export function formatLaunchReason(reason: string): string {
    return reason.replace(/_/g, ' ')
}

export function buildMemberLabel(
    member: TeamMemberRecord | null | undefined,
    roleNames: Map<string, string>
): string {
    if (!member) {
        return 'unknown member'
    }

    const roleLabel = getTeamRoleDisplayName(member.role, {
        roleName: roleNames.get(member.roleId),
        showPrototypeHint: true
    })
    return `${roleLabel} r${member.revision}`
}

export function getTaskAcceptance(
    acceptance: TeamProjectAcceptanceReadModel,
    taskId: string
): TeamTaskAcceptanceRecord {
    const record = acceptance.tasks[taskId]
    if (!record) {
        throw new Error(`Missing authoritative acceptance record for team task ${taskId}`)
    }

    return record
}

export const isTaskReadyForManagerAcceptance = isTaskReadyForManagerAcceptanceContract

export function isProjectReadyToDeliver(source: TeamProjectCompactBriefSource): boolean {
    return isProjectReadyToDeliverContract(source.project, source.tasks, source.acceptance)
}

export function collectOpenTasksAndCounts(source: TeamProjectCompactBriefSource): {
    openTasks: TeamTaskRecord[]
    counts: TeamProjectCompactCounts
} {
    const openTasks: TeamTaskRecord[] = []
    let blockedTaskCount = 0
    let reviewFailedTaskCount = 0
    let verificationFailedTaskCount = 0
    let readyForManagerAcceptanceCount = 0

    for (const task of source.tasks) {
        if (task.status === 'done' || task.status === 'canceled' || task.status === 'failed') {
            continue
        }

        openTasks.push(task)
        if (task.status === 'blocked') {
            blockedTaskCount += 1
        }

        const acceptance = getTaskAcceptance(source.acceptance, task.id)
        if (acceptance.reviewStatus === 'failed') {
            reviewFailedTaskCount += 1
        }
        if (acceptance.verificationStatus === 'failed') {
            verificationFailedTaskCount += 1
        }
        if (isTaskReadyForManagerAcceptance(acceptance)) {
            readyForManagerAcceptanceCount += 1
        }
    }

    return {
        openTasks,
        counts: {
            activeMemberCount: source.members.filter((member) => member.membershipState === 'active').length,
            inactiveMemberCount: source.members.filter((member) => member.membershipState !== 'active').length,
            openTaskCount: openTasks.length,
            blockedTaskCount,
            reviewFailedTaskCount,
            verificationFailedTaskCount,
            readyForManagerAcceptanceCount,
            deliveryReady: isProjectReadyToDeliver(source)
        }
    }
}

export function takeMostRecentCreated<T extends { createdAt: number }>(
    values: readonly T[],
    limit: number
): T[] {
    return values
        .slice()
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, limit)
}

export function summarizeEvent(
    event: TeamEventRecord,
    tasks: Map<string, TeamTaskRecord>,
    members: Map<string, TeamMemberRecord>,
    roleNames: Map<string, string>
): string {
    const task = event.targetId ? tasks.get(event.targetId) : undefined
    const member = event.targetId ? members.get(event.targetId) : undefined
    const payloadSummary = typeof event.payload?.summary === 'string' && event.payload.summary.trim().length > 0
        ? event.payload.summary.trim()
        : null
    if (payloadSummary) {
        return payloadSummary
    }

    switch (event.kind) {
        case 'project-updated':
            return 'Project settings updated.'
        case 'project-delivered':
            return 'Project delivered.'
        case 'member-replaced':
            return `Manager launched a new revision for ${buildMemberLabel(member, roleNames)}.`
        case 'user-interjected':
            return `User interjected on ${buildMemberLabel(member, roleNames)}.`
        case 'user-takeover-started':
            return `User took over ${buildMemberLabel(member, roleNames)}.`
        case 'user-takeover-ended':
            return `User returned ${buildMemberLabel(member, roleNames)} to the manager.`
        case 'review-failed':
            return `Review failed for task "${task?.title ?? event.targetId ?? 'unknown'}".`
        case 'verification-failed':
            return `Verification failed for task "${task?.title ?? event.targetId ?? 'unknown'}".`
        case 'review-passed':
            return `Review passed for task "${task?.title ?? event.targetId ?? 'unknown'}".`
        case 'verification-passed':
            return `Verification passed for task "${task?.title ?? event.targetId ?? 'unknown'}".`
        default:
            return formatEventKind(event.kind)
    }
}

export function buildCompactEvent(
    event: TeamEventRecord,
    tasks: Map<string, TeamTaskRecord>,
    members: Map<string, TeamMemberRecord>,
    roleNames: Map<string, string>
): TeamProjectCompactEvent {
    return {
        id: event.id,
        kind: event.kind,
        targetId: event.targetId,
        createdAt: event.createdAt,
        summary: summarizeEvent(event, tasks, members, roleNames)
    }
}

export function buildCompactMember(
    member: TeamMemberRecord,
    roleNames: Map<string, string>
): TeamProjectCompactBrief['activeMembers'][number] {
    return {
        id: member.id,
        sessionId: member.sessionId,
        role: member.role,
        roleId: member.roleId,
        roleName: roleNames.get(member.roleId) ?? null,
        membershipState: member.membershipState,
        controlOwner: member.controlOwner,
        revision: member.revision,
        spawnedForTaskId: member.spawnedForTaskId,
        updatedAt: member.updatedAt
    }
}

export function buildCompactTask(
    task: TeamTaskRecord,
    acceptance: TeamProjectAcceptanceReadModel
): TeamProjectCompactBrief['openTasks'][number] {
    const record = getTaskAcceptance(acceptance, task.id)
    return {
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        assigneeMemberId: task.assigneeMemberId,
        reviewerMemberId: task.reviewerMemberId,
        verifierMemberId: task.verifierMemberId,
        retryCount: task.retryCount,
        updatedAt: task.updatedAt,
        acceptance: {
            reviewStatus: record.reviewStatus,
            verificationStatus: record.verificationStatus,
            managerAccepted: record.managerAccepted,
            skipVerificationReason: record.skipVerificationReason,
            latestAcceptanceEvent: record.latestAcceptanceEvent
        }
    }
}

export function buildSummary(project: TeamProject, counts: TeamProjectCompactBrief['counts']): string {
    const segments = [
        `${counts.activeMemberCount} active members`,
        `${counts.openTaskCount} open tasks`
    ]
    if (counts.blockedTaskCount > 0) {
        segments.push(`${counts.blockedTaskCount} blocked`)
    }
    if (counts.readyForManagerAcceptanceCount > 0) {
        segments.push(`${counts.readyForManagerAcceptanceCount} awaiting manager acceptance`)
    }
    if (counts.deliveryReady) {
        segments.push('ready to deliver')
    }

    return `Project "${project.title}" has ${segments.join(', ')}.`
}
