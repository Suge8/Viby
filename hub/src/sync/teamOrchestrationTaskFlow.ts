import {
    buildMemberMeta,
    buildTaskAssignmentText,
    buildTaskFollowUpText,
    normalizeOptionalText
} from './teamOrchestrationMessages'
import {
    type CreateTeamTaskInput,
    type TeamTaskActionResult,
    type UpdateTeamTaskInput
} from './teamOrchestrationContracts'
import {
    compactSessionIds,
    type TeamOrchestrationRuntime
} from './teamOrchestrationCommon'
import {
    buildTeamTaskRecord,
    createTeamEventRecord
} from './teamOrchestrationRecords'
import {
    buildTaskUpdateEvents,
    buildUpdatedTask
} from './teamOrchestrationTaskSupport'

export async function createTask(
    runtime: TeamOrchestrationRuntime,
    input: CreateTeamTaskInput
): Promise<TeamTaskActionResult> {
    const snapshot = runtime.contextReader.requireActiveManagerProject(input.managerSessionId)
    const now = Date.now()
    const assignee = input.assigneeMemberId
        ? runtime.contextReader.requireAssignee(input.assigneeMemberId, input.managerSessionId)
        : null
    const reviewer = input.reviewerMemberId
        ? runtime.contextReader.requireRoleMember(input.reviewerMemberId, input.managerSessionId, 'reviewer')
        : null
    const verifier = input.verifierMemberId
        ? runtime.contextReader.requireRoleMember(input.verifierMemberId, input.managerSessionId, 'verifier')
        : null
    const dependsOn = runtime.contextReader.validateTaskDependencies(
        snapshot.project.id,
        null,
        input.dependsOn ?? []
    )
    const task = buildTeamTaskRecord({
        projectId: snapshot.project.id,
        title: input.title.trim(),
        description: normalizeOptionalText(input.description),
        acceptanceCriteria: normalizeOptionalText(input.acceptanceCriteria),
        parentTaskId: input.parentTaskId ?? null,
        status: input.status ?? 'todo',
        assigneeMemberId: assignee?.id ?? null,
        reviewerMemberId: reviewer?.id ?? null,
        verifierMemberId: verifier?.id ?? null,
        priority: normalizeOptionalText(input.priority),
        dependsOn,
        createdAt: now
    })
    const events = [
        createTeamEventRecord(snapshot.project.id, 'task', {
            kind: 'task-created',
            actorType: 'manager',
            actorId: input.managerSessionId,
            targetId: task.id,
            payload: {
                assigneeMemberId: task.assigneeMemberId,
                reviewerMemberId: task.reviewerMemberId,
                verifierMemberId: task.verifierMemberId
            },
            createdAt: now
        })
    ]
    if (assignee) {
        events.push(createTeamEventRecord(snapshot.project.id, 'task', {
            kind: 'task-assigned',
            actorType: 'manager',
            actorId: input.managerSessionId,
            targetId: task.id,
            payload: {
                assigneeMemberId: assignee.id
            },
            createdAt: now
        }))
    }

    const result = runtime.coordinator.applyCommand({
        type: 'batch',
        tasks: [task],
        events,
        affectedSessionIds: compactSessionIds([
            input.managerSessionId,
            assignee?.sessionId
        ])
    })

    if (assignee) {
        await runtime.appendInternalUserMessage(assignee.sessionId, {
            text: buildTaskAssignmentText(task, input.note),
            meta: buildMemberMeta(assignee, 'task-assign')
        })
    }

    return {
        task,
        snapshot: result.snapshot
    }
}

export async function updateTask(
    runtime: TeamOrchestrationRuntime,
    input: UpdateTeamTaskInput
): Promise<TeamTaskActionResult> {
    const context = runtime.contextReader.requireMutableTask(input.taskId, input.managerSessionId)
    const currentTask = context.task
    const nextTask = buildUpdatedTask(runtime, currentTask, input, input.managerSessionId)
    const events = buildTaskUpdateEvents(runtime, currentTask, nextTask, input.managerSessionId, input.note)
    const result = runtime.coordinator.applyCommand({
        type: 'batch',
        tasks: [nextTask],
        events,
        affectedSessionIds: compactSessionIds([
            input.managerSessionId,
            nextTask.assigneeMemberId ? runtime.store.teams.getMember(nextTask.assigneeMemberId)?.sessionId : null
        ])
    })

    const assignee = nextTask.assigneeMemberId
        ? runtime.store.teams.getMember(nextTask.assigneeMemberId)
        : null
    const normalizedNote = normalizeOptionalText(input.note)
    const assigneeChanged = currentTask.assigneeMemberId !== nextTask.assigneeMemberId
    if (assignee && (assigneeChanged || normalizedNote)) {
        const text = assigneeChanged
            ? buildTaskAssignmentText(nextTask, normalizedNote)
            : buildTaskFollowUpText(nextTask, normalizedNote!)
        const kind = assigneeChanged ? 'task-assign' : 'follow-up'

        await runtime.appendInternalUserMessage(assignee.sessionId, {
            text,
            meta: buildMemberMeta(assignee, kind)
        })
    }

    return {
        task: nextTask,
        snapshot: result.snapshot
    }
}
