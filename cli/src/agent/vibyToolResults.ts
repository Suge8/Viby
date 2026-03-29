import type {
    TeamEventRecord,
    TeamMemberRecord,
    TeamProjectSnapshot,
    TeamRoleDefinition,
    TeamTaskAcceptanceRecord,
    TeamTaskRecord,
} from '@viby/protocol/types'

type VibyToolTextContent = {
    type: 'text'
    text: string
}

export type VibyToolResult = {
    content: VibyToolTextContent[]
    isError: boolean
}

export function createTextResult(payload: unknown): VibyToolResult {
    const text = typeof payload === 'string'
        ? payload
        : JSON.stringify(payload, null, 2)

    return {
        content: [{
            type: 'text',
            text,
        }],
        isError: false,
    }
}

export function createToolErrorResult(error: unknown): VibyToolResult {
    const message = error instanceof Error ? error.message : String(error)
    return {
        content: [{
            type: 'text',
            text: message,
        }],
        isError: true,
    }
}

function summarizeEvent(event: TeamEventRecord): Record<string, unknown> {
    return {
        kind: event.kind,
        actorType: event.actorType,
        actorId: event.actorId,
        targetId: event.targetId,
        createdAt: event.createdAt,
        payload: event.payload,
    }
}

function summarizeRole(role: TeamRoleDefinition): Record<string, unknown> {
    return {
        id: role.id,
        source: role.source,
        prototype: role.prototype,
        name: role.name,
        promptExtension: role.promptExtension,
        providerFlavor: role.providerFlavor,
        model: role.model,
        reasoningEffort: role.reasoningEffort,
        isolationMode: role.isolationMode,
        updatedAt: role.updatedAt,
    }
}

function summarizeRoleCatalog(snapshot: TeamProjectSnapshot): Array<Record<string, unknown>> {
    return snapshot.roles.map((role) => summarizeRole(role))
}

function getRequiredTaskAcceptance(
    snapshot: TeamProjectSnapshot,
    taskId: string,
): TeamTaskAcceptanceRecord {
    const acceptance = snapshot.acceptance.tasks[taskId]
    if (!acceptance) {
        throw new Error(`Missing authoritative acceptance record for team task ${taskId}`)
    }

    return acceptance
}

function summarizeTask(task: TeamTaskRecord, snapshot: TeamProjectSnapshot): Record<string, unknown> {
    const acceptance = getRequiredTaskAcceptance(snapshot, task.id)

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
        completedAt: task.completedAt,
        acceptance: {
            reviewStatus: acceptance.reviewStatus,
            verificationStatus: acceptance.verificationStatus,
            managerAccepted: acceptance.managerAccepted,
            skipVerificationReason: acceptance.skipVerificationReason,
            latestEvent: acceptance.latestAcceptanceEvent
                ? summarizeEvent(acceptance.latestAcceptanceEvent)
                : null,
        },
    }
}

function summarizeMember(member: TeamMemberRecord): Record<string, unknown> {
    return {
        id: member.id,
        role: member.role,
        roleId: member.roleId,
        sessionId: member.sessionId,
        membershipState: member.membershipState,
        controlOwner: member.controlOwner,
        revision: member.revision,
        providerFlavor: member.providerFlavor,
        model: member.model,
        isolationMode: member.isolationMode,
        workspaceRoot: member.workspaceRoot,
        spawnedForTaskId: member.spawnedForTaskId,
        supersedesMemberId: member.supersedesMemberId,
        supersededByMemberId: member.supersededByMemberId,
        updatedAt: member.updatedAt,
    }
}

function summarizeSnapshotEnvelope(snapshot: TeamProjectSnapshot): Record<string, unknown> {
    return {
        compactBrief: snapshot.compactBrief,
        roles: summarizeRoleCatalog(snapshot),
    }
}

export function summarizeTeamSnapshot(snapshot: TeamProjectSnapshot): Record<string, unknown> {
    return summarizeSnapshotEnvelope(snapshot)
}

export function summarizeTaskAction(
    action: string,
    taskId: string,
    snapshot: TeamProjectSnapshot,
): Record<string, unknown> {
    const task = snapshot.tasks.find((candidate) => candidate.id === taskId)
    if (!task) {
        throw new Error(`Updated team task ${taskId} is missing from the authoritative snapshot`)
    }

    return {
        action,
        ...summarizeSnapshotEnvelope(snapshot),
        task: summarizeTask(task, snapshot),
        recentAcceptanceEvents: (snapshot.acceptance.tasks[task.id]?.recentEvents ?? [])
            .map((event) => summarizeEvent(event)),
    }
}

export function summarizeMemberAction(
    action: string,
    memberId: string,
    snapshot: TeamProjectSnapshot,
    extras?: Record<string, unknown>,
): Record<string, unknown> {
    const member = snapshot.members.find((candidate) => candidate.id === memberId)
    if (!member) {
        throw new Error(`Updated team member ${memberId} is missing from the authoritative snapshot`)
    }

    return {
        action,
        ...summarizeSnapshotEnvelope(snapshot),
        member: summarizeMember(member),
        ...(extras ?? {}),
    }
}

export function summarizeRoleAction(
    action: string,
    roleId: string,
    snapshot: TeamProjectSnapshot,
    extras?: Record<string, unknown>,
): Record<string, unknown> {
    const role = snapshot.roles.find((candidate) => candidate.id === roleId)

    return {
        action,
        roleId,
        ...summarizeSnapshotEnvelope(snapshot),
        ...(role ? { role: summarizeRole(role) } : {}),
        ...(extras ?? {}),
    }
}

export function summarizeProjectAction(
    action: string,
    snapshot: TeamProjectSnapshot,
    extras?: Record<string, unknown>,
): Record<string, unknown> {
    return {
        action,
        ...summarizeSnapshotEnvelope(snapshot),
        project: {
            id: snapshot.project.id,
            title: snapshot.project.title,
            status: snapshot.project.status,
            goal: snapshot.project.goal,
            deliveredAt: snapshot.project.deliveredAt,
            updatedAt: snapshot.project.updatedAt,
        },
        ...(extras ?? {}),
    }
}
