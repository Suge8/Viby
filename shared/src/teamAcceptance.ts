import type {
    TeamEventRecord,
    TeamProject,
    TeamProjectAcceptanceReadModel,
    TeamTaskAcceptanceRecord,
    TeamTaskAcceptanceState,
    TeamTaskReviewStatus,
    TeamTaskRecord
} from './teamSchemas'
import type {
    TeamEventKind,
    TeamTaskVerificationStatus
} from './teamSchemas'

export const TEAM_ACCEPTANCE_EVENT_KINDS = [
    'review-requested',
    'review-passed',
    'review-failed',
    'verification-requested',
    'verification-passed',
    'verification-failed',
    'manager-accepted'
] as const satisfies readonly TeamEventKind[]

export const TEAM_ACCEPTANCE_RESULT_EVENT_KINDS = [
    'review-passed',
    'review-failed',
    'verification-passed',
    'verification-failed',
    'manager-accepted'
] as const satisfies readonly TeamEventKind[]

const ACCEPTANCE_EVENT_KINDS = new Set<TeamEventKind>(TEAM_ACCEPTANCE_EVENT_KINDS)
const ACCEPTANCE_RESULT_EVENT_KINDS = new Set<TeamEventKind>(TEAM_ACCEPTANCE_RESULT_EVENT_KINDS)

export const TEAM_ACCEPTANCE_RECENT_RESULTS_LIMIT = 8
export const TEAM_TASK_ACCEPTANCE_RECENT_EVENTS_LIMIT = 5

export function getTaskAcceptanceEvents(
    taskId: string,
    events: readonly TeamEventRecord[]
): TeamEventRecord[] {
    return events
        .filter((event) =>
            event.targetType === 'task'
            && event.targetId === taskId
            && ACCEPTANCE_EVENT_KINDS.has(event.kind)
        )
        .slice()
        .sort((left, right) => left.createdAt - right.createdAt)
}

export function getTaskAcceptanceState(
    task: Pick<TeamTaskRecord, 'id' | 'status'>,
    events: readonly TeamEventRecord[]
): TeamTaskAcceptanceState {
    let reviewStatus: TeamTaskReviewStatus = 'idle'
    let verificationStatus: TeamTaskVerificationStatus = 'idle'
    let managerAccepted = false
    let skipVerificationReason: string | null = null
    let latestAcceptanceEvent: TeamEventRecord | null = null

    for (const event of getTaskAcceptanceEvents(task.id, events)) {
        latestAcceptanceEvent = event
        switch (event.kind) {
            case 'review-requested':
                reviewStatus = 'requested'
                verificationStatus = 'idle'
                managerAccepted = false
                skipVerificationReason = null
                break
            case 'review-passed':
                reviewStatus = 'passed'
                managerAccepted = false
                skipVerificationReason = null
                break
            case 'review-failed':
                reviewStatus = 'failed'
                verificationStatus = 'idle'
                managerAccepted = false
                skipVerificationReason = null
                break
            case 'verification-requested':
                verificationStatus = 'requested'
                managerAccepted = false
                skipVerificationReason = null
                break
            case 'verification-passed':
                verificationStatus = 'passed'
                managerAccepted = false
                skipVerificationReason = null
                break
            case 'verification-failed':
                verificationStatus = 'failed'
                managerAccepted = false
                skipVerificationReason = null
                break
            case 'manager-accepted':
                managerAccepted = true
                skipVerificationReason = getSkipVerificationReason(event)
                break
        }
    }

    return {
        reviewStatus,
        verificationStatus,
        managerAccepted,
        skipVerificationReason,
        latestAcceptanceEvent
    }
}

export function buildTaskAcceptanceRecord(
    task: Pick<TeamTaskRecord, 'id' | 'status'>,
    events: readonly TeamEventRecord[]
): TeamTaskAcceptanceRecord {
    return {
        ...getTaskAcceptanceState(task, events),
        recentEvents: getTaskAcceptanceEvents(task.id, events)
            .slice(-TEAM_TASK_ACCEPTANCE_RECENT_EVENTS_LIMIT)
    }
}

export function buildProjectAcceptanceReadModel(
    tasks: readonly Pick<TeamTaskRecord, 'id' | 'status'>[],
    events: readonly TeamEventRecord[]
): TeamProjectAcceptanceReadModel {
    const acceptanceByTask: Record<string, TeamTaskAcceptanceRecord> = {}

    for (const task of tasks) {
        acceptanceByTask[task.id] = buildTaskAcceptanceRecord(task, events)
    }

    return {
        tasks: acceptanceByTask,
        recentResults: events
            .filter((event) => ACCEPTANCE_RESULT_EVENT_KINDS.has(event.kind))
            .slice()
            .sort((left, right) => right.createdAt - left.createdAt)
            .slice(0, TEAM_ACCEPTANCE_RECENT_RESULTS_LIMIT)
    }
}

export function isTaskReadyForManagerAcceptance(record: TeamTaskAcceptanceState): boolean {
    return record.reviewStatus === 'passed'
        && record.verificationStatus === 'passed'
        && record.managerAccepted === false
}

export function isTaskReadyToDeliver(
    task: Pick<TeamTaskRecord, 'status'>,
    record: TeamTaskAcceptanceState
): boolean {
    return task.status === 'done'
        && record.reviewStatus === 'passed'
        && record.managerAccepted
        && (record.verificationStatus === 'passed' || record.skipVerificationReason !== null)
}

export function isProjectReadyToDeliver(
    project: Pick<TeamProject, 'status'>,
    tasks: readonly Pick<TeamTaskRecord, 'id' | 'status'>[],
    acceptance: Pick<TeamProjectAcceptanceReadModel, 'tasks'>
): boolean {
    if (project.status !== 'active' || tasks.length === 0) {
        return false
    }

    return tasks.every((task) => {
        const record = acceptance.tasks[task.id]
        if (!record) {
            throw new Error(`Missing authoritative acceptance record for team task ${task.id}`)
        }
        return isTaskReadyToDeliver(task, record)
    })
}

function getSkipVerificationReason(event: TeamEventRecord): string | null {
    const value = event.payload?.skipVerificationReason
    return typeof value === 'string' && value.trim().length > 0
        ? value.trim()
        : null
}
