import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
    createTextResult,
    summarizeMemberAction,
    summarizeProjectAction,
    summarizeRoleAction,
    summarizeTaskAction,
    summarizeTeamSnapshot,
    type VibyToolResult
} from './vibyToolResults'
import {
    ACCEPT_TASK_INPUT_SCHEMA,
    CHANGE_TITLE_INPUT_SCHEMA,
    CLOSE_PROJECT_INPUT_SCHEMA,
    CREATE_ROLE_INPUT_SCHEMA,
    CREATE_TASK_INPUT_SCHEMA,
    DELETE_ROLE_INPUT_SCHEMA,
    EMPTY_INPUT_SCHEMA,
    MESSAGE_MEMBER_INPUT_SCHEMA,
    REVIEW_REQUEST_INPUT_SCHEMA,
    REVIEW_RESULT_INPUT_SCHEMA,
    SPAWN_MEMBER_INPUT_SCHEMA,
    UPDATE_MEMBER_INPUT_SCHEMA,
    UPDATE_ROLE_INPUT_SCHEMA,
    UPDATE_TASK_INPUT_SCHEMA,
    VERIFICATION_REQUEST_INPUT_SCHEMA,
    VERIFICATION_RESULT_INPUT_SCHEMA
} from './vibyToolSchemas'
import {
    fetchSnapshotForCurrentTeam,
    requireMemberContext,
    requireTeamContext,
    type VibyToolExecutionContext
} from './vibyToolSupport'

export async function executeChangeTitle(
    context: VibyToolExecutionContext,
    args: z.infer<typeof CHANGE_TITLE_INPUT_SCHEMA>
): Promise<VibyToolResult> {
    context.client.sendClaudeSessionMessage({
        type: 'summary',
        summary: args.title,
        leafUuid: randomUUID()
    })

    return createTextResult(`Successfully changed chat title to: "${args.title}"`)
}

export async function executeTeamGetSnapshot(
    context: VibyToolExecutionContext,
    _args: z.infer<typeof EMPTY_INPUT_SCHEMA>
): Promise<VibyToolResult> {
    const teamContext = requireTeamContext(context.teamContext)
    const snapshot = await fetchSnapshotForCurrentTeam(context.client, teamContext)
    return createTextResult(summarizeTeamSnapshot(snapshot))
}

export async function executeTeamSpawnMember(
    context: VibyToolExecutionContext,
    args: z.infer<typeof SPAWN_MEMBER_INPUT_SCHEMA>
): Promise<VibyToolResult> {
    const teamContext = requireTeamContext(context.teamContext)
    const result = await context.client.spawnTeamMember({
        managerSessionId: teamContext.managerSessionId,
        ...args
    })
    const snapshot = await fetchSnapshotForCurrentTeam(context.client, teamContext)
    return createTextResult(summarizeMemberAction('member_spawned', result.member.id, snapshot, {
        launch: result.launch ?? null
    }))
}

export async function executeTeamCreateRole(
    context: VibyToolExecutionContext,
    args: z.infer<typeof CREATE_ROLE_INPUT_SCHEMA>
): Promise<VibyToolResult> {
    const teamContext = requireTeamContext(context.teamContext)
    const role = await context.client.createTeamRole(teamContext.projectId, {
        managerSessionId: teamContext.managerSessionId,
        ...args
    })
    const snapshot = await fetchSnapshotForCurrentTeam(context.client, teamContext)
    return createTextResult(summarizeRoleAction('role_created', role.id, snapshot))
}

export async function executeTeamUpdateRole(
    context: VibyToolExecutionContext,
    args: z.infer<typeof UPDATE_ROLE_INPUT_SCHEMA>
): Promise<VibyToolResult> {
    const teamContext = requireTeamContext(context.teamContext)
    const role = await context.client.updateTeamRole(teamContext.projectId, args.roleId, {
        managerSessionId: teamContext.managerSessionId,
        name: args.name,
        promptExtension: args.promptExtension,
        providerFlavor: args.providerFlavor,
        model: args.model,
        reasoningEffort: args.reasoningEffort,
        isolationMode: args.isolationMode
    })
    const snapshot = await fetchSnapshotForCurrentTeam(context.client, teamContext)
    return createTextResult(summarizeRoleAction('role_updated', role.id, snapshot))
}

export async function executeTeamDeleteRole(
    context: VibyToolExecutionContext,
    args: z.infer<typeof DELETE_ROLE_INPUT_SCHEMA>
): Promise<VibyToolResult> {
    const teamContext = requireTeamContext(context.teamContext)
    const roleId = await context.client.deleteTeamRole(teamContext.projectId, args.roleId, {
        managerSessionId: teamContext.managerSessionId
    })
    const snapshot = await fetchSnapshotForCurrentTeam(context.client, teamContext)
    return createTextResult(summarizeRoleAction('role_deleted', roleId, snapshot))
}

export async function executeTeamUpdateMember(
    context: VibyToolExecutionContext,
    args: z.infer<typeof UPDATE_MEMBER_INPUT_SCHEMA>
): Promise<VibyToolResult> {
    const teamContext = requireTeamContext(context.teamContext)
    const result = await context.client.updateTeamMember(args.memberId, {
        ...args,
        managerSessionId: teamContext.managerSessionId
    })
    const snapshot = await fetchSnapshotForCurrentTeam(context.client, teamContext)
    const action = args.action === 'remove' ? 'member_removed' : 'member_replaced'
    return createTextResult(summarizeMemberAction(action, result.member.id, snapshot, {
        launch: result.launch ?? null,
        replacedMemberId: result.replacedMemberId ?? null
    }))
}

export async function executeTeamCreateTask(
    context: VibyToolExecutionContext,
    args: z.infer<typeof CREATE_TASK_INPUT_SCHEMA>
): Promise<VibyToolResult> {
    const teamContext = requireTeamContext(context.teamContext)
    const task = await context.client.createTeamTask({
        managerSessionId: teamContext.managerSessionId,
        ...args
    })
    const snapshot = await fetchSnapshotForCurrentTeam(context.client, teamContext)
    return createTextResult(summarizeTaskAction('task_created', task.id, snapshot))
}

export async function executeTeamUpdateTask(
    context: VibyToolExecutionContext,
    args: z.infer<typeof UPDATE_TASK_INPUT_SCHEMA>
): Promise<VibyToolResult> {
    const teamContext = requireTeamContext(context.teamContext)
    const task = await context.client.updateTeamTask(args.taskId, {
        managerSessionId: teamContext.managerSessionId,
        title: args.title,
        description: args.description,
        acceptanceCriteria: args.acceptanceCriteria,
        status: args.status,
        assigneeMemberId: args.assigneeMemberId,
        reviewerMemberId: args.reviewerMemberId,
        verifierMemberId: args.verifierMemberId,
        priority: args.priority,
        dependsOn: args.dependsOn,
        note: args.note
    })
    const snapshot = await fetchSnapshotForCurrentTeam(context.client, teamContext)
    return createTextResult(summarizeTaskAction('task_updated', task.id, snapshot))
}

export async function executeTeamMessageMember(
    context: VibyToolExecutionContext,
    args: z.infer<typeof MESSAGE_MEMBER_INPUT_SCHEMA>
): Promise<VibyToolResult> {
    const teamContext = requireTeamContext(context.teamContext)
    await context.client.messageTeamMember(args.memberId, {
        managerSessionId: teamContext.managerSessionId,
        text: args.text,
        kind: args.kind
    })
    const snapshot = await fetchSnapshotForCurrentTeam(context.client, teamContext)
    return createTextResult(summarizeMemberAction('member_messaged', args.memberId, snapshot, {
        kind: args.kind ?? 'follow-up'
    }))
}

export async function executeTeamRequestReview(
    context: VibyToolExecutionContext,
    args: z.infer<typeof REVIEW_REQUEST_INPUT_SCHEMA>
): Promise<VibyToolResult> {
    const teamContext = requireTeamContext(context.teamContext)
    await context.client.requestTaskReview(args.taskId, {
        managerSessionId: teamContext.managerSessionId,
        reviewerMemberId: args.reviewerMemberId,
        note: args.note
    })
    const snapshot = await fetchSnapshotForCurrentTeam(context.client, teamContext)
    return createTextResult(summarizeTaskAction('review_requested', args.taskId, snapshot))
}

export async function executeTeamSubmitReviewResult(
    context: VibyToolExecutionContext,
    args: z.infer<typeof REVIEW_RESULT_INPUT_SCHEMA>
): Promise<VibyToolResult> {
    const teamContext = requireMemberContext(context.teamContext, 'reviewer')
    await context.client.submitTaskReviewResult(args.taskId, {
        memberId: teamContext.memberId,
        decision: args.decision,
        summary: args.summary
    })
    const snapshot = await fetchSnapshotForCurrentTeam(context.client, teamContext)
    return createTextResult(summarizeTaskAction('review_result_submitted', args.taskId, snapshot))
}

export async function executeTeamRequestVerification(
    context: VibyToolExecutionContext,
    args: z.infer<typeof VERIFICATION_REQUEST_INPUT_SCHEMA>
): Promise<VibyToolResult> {
    const teamContext = requireTeamContext(context.teamContext)
    await context.client.requestTaskVerification(args.taskId, {
        managerSessionId: teamContext.managerSessionId,
        verifierMemberId: args.verifierMemberId,
        note: args.note
    })
    const snapshot = await fetchSnapshotForCurrentTeam(context.client, teamContext)
    return createTextResult(summarizeTaskAction('verification_requested', args.taskId, snapshot))
}

export async function executeTeamSubmitVerificationResult(
    context: VibyToolExecutionContext,
    args: z.infer<typeof VERIFICATION_RESULT_INPUT_SCHEMA>
): Promise<VibyToolResult> {
    const teamContext = requireMemberContext(context.teamContext, 'verifier')
    await context.client.submitTaskVerificationResult(args.taskId, {
        memberId: teamContext.memberId,
        decision: args.decision,
        summary: args.summary
    })
    const snapshot = await fetchSnapshotForCurrentTeam(context.client, teamContext)
    return createTextResult(summarizeTaskAction('verification_result_submitted', args.taskId, snapshot))
}

export async function executeTeamAcceptTask(
    context: VibyToolExecutionContext,
    args: z.infer<typeof ACCEPT_TASK_INPUT_SCHEMA>
): Promise<VibyToolResult> {
    const teamContext = requireTeamContext(context.teamContext)
    await context.client.acceptTeamTask(args.taskId, {
        managerSessionId: teamContext.managerSessionId,
        summary: args.summary,
        skipVerificationReason: args.skipVerificationReason
    })
    const snapshot = await fetchSnapshotForCurrentTeam(context.client, teamContext)
    return createTextResult(summarizeTaskAction('task_accepted', args.taskId, snapshot))
}

export async function executeTeamCloseProject(
    context: VibyToolExecutionContext,
    args: z.infer<typeof CLOSE_PROJECT_INPUT_SCHEMA>
): Promise<VibyToolResult> {
    const teamContext = requireTeamContext(context.teamContext)
    await context.client.closeTeamProject(teamContext.projectId, {
        managerSessionId: teamContext.managerSessionId,
        summary: args.summary
    })
    const snapshot = await fetchSnapshotForCurrentTeam(context.client, teamContext)
    return createTextResult(summarizeProjectAction('project_closed', snapshot))
}
