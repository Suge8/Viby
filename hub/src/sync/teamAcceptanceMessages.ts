import type {
    MessageMeta,
    TeamMemberRecord,
    TeamTaskRecord
} from '@viby/protocol/types'
import type {
    SubmitTaskReviewResultInput,
    SubmitTaskVerificationResultInput
} from './teamAcceptanceContracts'

export function normalizeOptionalText(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
        return null
    }

    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

export function buildMemberMeta(
    member: TeamMemberRecord,
    teamMessageKind: 'review-request' | 'verify-request'
): MessageMeta {
    return {
        sentFrom: 'manager',
        teamProjectId: member.projectId,
        managerSessionId: member.managerSessionId,
        memberId: member.id,
        sessionRole: 'member',
        teamMessageKind,
        controlOwner: member.controlOwner
    }
}

export function buildManagerMeta(projectId: string, managerSessionId: string, memberId?: string): MessageMeta {
    return {
        sentFrom: 'team-system',
        teamProjectId: projectId,
        managerSessionId,
        sessionRole: 'manager',
        teamMessageKind: 'system-event',
        controlOwner: 'manager',
        ...(memberId ? { memberId } : {})
    }
}

function buildTaskDetailLines(task: TeamTaskRecord): string[] {
    const lines = [
        `任务：${task.title}`
    ]
    const description = normalizeOptionalText(task.description)
    const acceptanceCriteria = normalizeOptionalText(task.acceptanceCriteria)

    if (description) {
        lines.push(`说明：${description}`)
    }
    if (acceptanceCriteria) {
        lines.push(`验收标准：${acceptanceCriteria}`)
    }

    return lines
}

export function buildReviewRequestText(task: TeamTaskRecord, note?: string | null): string {
    const lines = [
        '经理请求你执行 review。',
        ...buildTaskDetailLines(task),
        '请明确给出 accept 或 request_changes，并指出回归风险与缺失测试。'
    ]
    const normalizedNote = normalizeOptionalText(note)
    if (normalizedNote) {
        lines.push(`额外要求：${normalizedNote}`)
    }

    return lines.join('\n')
}

export function buildVerificationRequestText(task: TeamTaskRecord, note?: string | null): string {
    const lines = [
        '经理请求你执行 verification。',
        ...buildTaskDetailLines(task),
        '请根据测试、smoke 和验收标准，明确给出 pass 或 fail。'
    ]
    const normalizedNote = normalizeOptionalText(note)
    if (normalizedNote) {
        lines.push(`额外要求：${normalizedNote}`)
    }

    return lines.join('\n')
}

export function buildManagerReviewNotice(
    task: TeamTaskRecord,
    reviewer: TeamMemberRecord,
    decision: SubmitTaskReviewResultInput['decision'],
    summary: string
): string {
    const verdict = decision === 'accept' ? '通过了 review' : '未通过 review'
    return `${reviewer.role} r${reviewer.revision} 对任务「${task.title}」${verdict}：${summary}`
}

export function buildManagerVerificationNotice(
    task: TeamTaskRecord,
    verifier: TeamMemberRecord,
    decision: SubmitTaskVerificationResultInput['decision'],
    summary: string
): string {
    const verdict = decision === 'pass' ? '通过了 verification' : '未通过 verification'
    return `${verifier.role} r${verifier.revision} 对任务「${task.title}」${verdict}：${summary}`
}
