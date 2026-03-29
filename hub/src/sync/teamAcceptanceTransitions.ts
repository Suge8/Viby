import type { TeamTaskRecord } from '@viby/protocol/types'
import type {
    SubmitTaskReviewResultInput,
    SubmitTaskVerificationResultInput
} from './teamAcceptanceContracts'

export function compactSessionIds(values: Array<string | null | undefined>): string[] {
    return values.filter((value): value is string => typeof value === 'string' && value.length > 0)
}

export function createReviewRequestedTask(
    task: TeamTaskRecord,
    reviewerMemberId: string,
    now: number
): TeamTaskRecord {
    return {
        ...task,
        reviewerMemberId,
        verifierMemberId: null,
        status: 'in_review',
        updatedAt: now,
        completedAt: null
    }
}

export function createReviewResultTask(
    task: TeamTaskRecord,
    decision: SubmitTaskReviewResultInput['decision'],
    now: number
): TeamTaskRecord {
    if (decision === 'accept') {
        return {
            ...task,
            status: 'in_review',
            updatedAt: now
        }
    }

    return {
        ...task,
        status: 'running',
        verifierMemberId: null,
        retryCount: task.retryCount + 1,
        updatedAt: now,
        completedAt: null
    }
}

export function createVerificationRequestedTask(
    task: TeamTaskRecord,
    verifierMemberId: string,
    now: number
): TeamTaskRecord {
    return {
        ...task,
        verifierMemberId,
        status: 'in_verification',
        updatedAt: now,
        completedAt: null
    }
}

export function createVerificationResultTask(
    task: TeamTaskRecord,
    decision: SubmitTaskVerificationResultInput['decision'],
    now: number
): TeamTaskRecord {
    if (decision === 'pass') {
        return {
            ...task,
            status: 'in_verification',
            updatedAt: now
        }
    }

    return {
        ...task,
        status: 'running',
        retryCount: task.retryCount + 1,
        updatedAt: now,
        completedAt: null
    }
}

export function createAcceptedTask(task: TeamTaskRecord, now: number): TeamTaskRecord {
    return {
        ...task,
        status: 'done',
        updatedAt: now,
        completedAt: now
    }
}
