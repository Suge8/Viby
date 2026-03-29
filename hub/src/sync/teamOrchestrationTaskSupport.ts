import type { TeamEventRecord, TeamTaskRecord } from '@viby/protocol/types'
import type { UpdateTeamTaskInput } from './teamOrchestrationContracts'
import type { TeamOrchestrationRuntime } from './teamOrchestrationCommon'
import { normalizeOptionalText } from './teamOrchestrationMessages'
import { createTeamEventRecord } from './teamOrchestrationRecords'

export function buildUpdatedTask(
    runtime: TeamOrchestrationRuntime,
    currentTask: TeamTaskRecord,
    input: UpdateTeamTaskInput,
    managerSessionId: string
): TeamTaskRecord {
    const assignee = input.assigneeMemberId === undefined
        ? undefined
        : (input.assigneeMemberId
            ? runtime.contextReader.requireAssignee(input.assigneeMemberId, managerSessionId)
            : null)
    const reviewer = input.reviewerMemberId === undefined
        ? undefined
        : (input.reviewerMemberId
            ? runtime.contextReader.requireRoleMember(input.reviewerMemberId, managerSessionId, 'reviewer')
            : null)
    const verifier = input.verifierMemberId === undefined
        ? undefined
        : (input.verifierMemberId
            ? runtime.contextReader.requireRoleMember(input.verifierMemberId, managerSessionId, 'verifier')
            : null)
    const dependsOn = input.dependsOn === undefined
        ? currentTask.dependsOn
        : runtime.contextReader.validateTaskDependencies(currentTask.projectId, currentTask.id, input.dependsOn)
    const status = input.status ?? currentTask.status
    const now = Date.now()

    return {
        ...currentTask,
        title: input.title?.trim() ?? currentTask.title,
        description: input.description === undefined
            ? currentTask.description
            : normalizeOptionalText(input.description),
        acceptanceCriteria: input.acceptanceCriteria === undefined
            ? currentTask.acceptanceCriteria
            : normalizeOptionalText(input.acceptanceCriteria),
        status,
        assigneeMemberId: assignee === undefined ? currentTask.assigneeMemberId : assignee?.id ?? null,
        reviewerMemberId: reviewer === undefined ? currentTask.reviewerMemberId : reviewer?.id ?? null,
        verifierMemberId: verifier === undefined ? currentTask.verifierMemberId : verifier?.id ?? null,
        priority: input.priority === undefined ? currentTask.priority : normalizeOptionalText(input.priority),
        dependsOn,
        updatedAt: now,
        completedAt: status === 'done' ? (currentTask.completedAt ?? now) : null
    }
}

export function buildTaskUpdateEvents(
    runtime: TeamOrchestrationRuntime,
    currentTask: TeamTaskRecord,
    nextTask: TeamTaskRecord,
    managerSessionId: string,
    note?: string | null
): TeamEventRecord[] {
    const now = Date.now()
    const events: TeamEventRecord[] = []
    const normalizedNote = normalizeOptionalText(note)

    if (currentTask.assigneeMemberId !== nextTask.assigneeMemberId) {
        events.push(createTeamEventRecord(nextTask.projectId, 'task', {
            kind: 'task-assigned',
            actorType: 'manager',
            actorId: managerSessionId,
            targetId: nextTask.id,
            payload: {
                fromAssigneeMemberId: currentTask.assigneeMemberId,
                toAssigneeMemberId: nextTask.assigneeMemberId,
                note: normalizedNote
            },
            createdAt: now
        }))
    }

    if (currentTask.status !== nextTask.status) {
        events.push(createTeamEventRecord(nextTask.projectId, 'task', {
            kind: 'task-status-changed',
            actorType: 'manager',
            actorId: managerSessionId,
            targetId: nextTask.id,
            payload: {
                fromStatus: currentTask.status,
                toStatus: nextTask.status,
                note: normalizedNote
            },
            createdAt: now
        }))
    }

    const updatedFields = []
    if (currentTask.title !== nextTask.title) updatedFields.push('title')
    if (currentTask.description !== nextTask.description) updatedFields.push('description')
    if (currentTask.acceptanceCriteria !== nextTask.acceptanceCriteria) updatedFields.push('acceptanceCriteria')
    if (currentTask.priority !== nextTask.priority) updatedFields.push('priority')
    if (JSON.stringify(currentTask.dependsOn) !== JSON.stringify(nextTask.dependsOn)) updatedFields.push('dependsOn')
    if (currentTask.reviewerMemberId !== nextTask.reviewerMemberId) updatedFields.push('reviewerMemberId')
    if (currentTask.verifierMemberId !== nextTask.verifierMemberId) updatedFields.push('verifierMemberId')

    if (updatedFields.length > 0) {
        events.push(createTeamEventRecord(nextTask.projectId, 'task', {
            kind: 'task-updated',
            actorType: 'manager',
            actorId: managerSessionId,
            targetId: nextTask.id,
            payload: {
                updatedFields,
                note: normalizedNote
            },
            createdAt: now
        }))
    }

    return events
}
