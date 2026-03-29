import type {
    MessageMeta,
    TeamMemberRecord,
    TeamProject,
    TeamTaskRecord,
} from '@viby/protocol/types'
import type { TeamOrchestrationMessageKind } from './teamOrchestrationContracts'

export function normalizeOptionalText(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
        return null
    }

    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

export function buildMemberMeta(
    member: TeamMemberRecord,
    kind: TeamOrchestrationMessageKind
): MessageMeta {
    return {
        sentFrom: 'manager',
        teamProjectId: member.projectId,
        managerSessionId: member.managerSessionId,
        memberId: member.id,
        sessionRole: 'member',
        teamMessageKind: kind,
        controlOwner: member.controlOwner
    }
}

function buildTaskDetailLines(task: TeamTaskRecord): string[] {
    const lines = [`任务：${task.title}`]
    const description = normalizeOptionalText(task.description)
    const acceptanceCriteria = normalizeOptionalText(task.acceptanceCriteria)
    const priority = normalizeOptionalText(task.priority)

    if (description) {
        lines.push(`说明：${description}`)
    }
    if (acceptanceCriteria) {
        lines.push(`验收标准：${acceptanceCriteria}`)
    }
    if (priority) {
        lines.push(`优先级：${priority}`)
    }
    if (task.dependsOn.length > 0) {
        lines.push(`依赖任务：${task.dependsOn.join(', ')}`)
    }

    return lines
}

export function buildTaskAssignmentText(task: TeamTaskRecord, note?: string | null): string {
    const lines = [
        '经理为你分配了任务。',
        ...buildTaskDetailLines(task),
        '请按任务目标推进；如果被阻塞，明确报告根因、影响和下一步建议。'
    ]
    const normalizedNote = normalizeOptionalText(note)
    if (normalizedNote) {
        lines.push(`额外要求：${normalizedNote}`)
    }

    return lines.join('\n')
}

export function buildTaskFollowUpText(task: TeamTaskRecord, note: string): string {
    return [
        '经理更新了当前任务，请从最新状态继续推进。',
        ...buildTaskDetailLines(task),
        `补充说明：${note}`
    ].join('\n')
}

export function buildDirectMessageText(text: string): string {
    return normalizeOptionalText(text) ?? ''
}

export function buildProjectCloseSummary(project: TeamProject, summary?: string | null): string {
    const normalizedSummary = normalizeOptionalText(summary)
    if (!normalizedSummary) {
        return `项目「${project.title}」已由经理标记为 delivered。`
    }

    return `项目「${project.title}」已由经理标记为 delivered：${normalizedSummary}`
}
