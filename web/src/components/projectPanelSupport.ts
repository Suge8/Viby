import type {
    TeamProjectSnapshot,
    TeamTaskAcceptanceRecord,
    TeamTaskRecord,
} from '@/types/api'

const TASK_STATUS_PRIORITY: Record<TeamTaskRecord['status'], number> = {
    in_verification: 0,
    in_review: 1,
    blocked: 2,
    running: 3,
    todo: 4,
    done: 5,
    canceled: 6,
    failed: 7,
}

export function getProjectPanelTaskPriority(status: TeamTaskRecord['status']): number {
    return TASK_STATUS_PRIORITY[status]
}

export function getTaskAcceptanceSummary(acceptance: TeamTaskAcceptanceRecord): string {
    if (acceptance.managerAccepted) {
        return '经理已验收'
    }
    if (acceptance.verificationStatus === 'requested') {
        return '等待 verification'
    }
    if (acceptance.verificationStatus === 'passed') {
        return 'verification 通过，待经理验收'
    }
    if (acceptance.verificationStatus === 'failed') {
        return 'verification 未通过'
    }
    if (acceptance.reviewStatus === 'requested') {
        return '等待 review'
    }
    if (acceptance.reviewStatus === 'passed') {
        return 'review 通过'
    }
    if (acceptance.reviewStatus === 'failed') {
        return 'review 要求修改'
    }
    return '尚未进入验收'
}

export function getRequiredTaskAcceptance(
    snapshot: TeamProjectSnapshot,
    taskId: string
): TeamTaskAcceptanceRecord {
    const acceptance = snapshot.acceptance.tasks[taskId]
    if (!acceptance) {
        throw new Error(`Missing authoritative acceptance record for team task ${taskId}`)
    }
    return acceptance
}

export function parsePositiveInt(value: string): number | null {
    if (!value.trim()) {
        return null
    }
    const parsed = Number.parseInt(value, 10)
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return null
    }
    return parsed
}

export function getProjectSettingsErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message
    }
    return 'Could not update project settings right now.'
}
