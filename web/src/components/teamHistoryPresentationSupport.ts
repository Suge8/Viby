import type { TeamEventRecord, TeamTaskRecord } from '@/types/api'

export type TeamEventPresentationContext = {
    memberLabelById?: ReadonlyMap<string, string>
    taskTitleById?: ReadonlyMap<string, string>
}

export const FALLBACK_MEMBER_LABEL = '成员'
export const FALLBACK_TASK_TITLE = '未命名任务'

const TEAM_TASK_STATUS_LABELS: Record<TeamTaskRecord['status'], string> = {
    todo: '待开始',
    running: '进行中',
    blocked: '阻塞中',
    in_review: '待 review',
    in_verification: '待 verification',
    done: '已完成',
    canceled: '已取消',
    failed: '已失败'
}

const PROJECT_SETTING_FIELD_LABELS: Record<string, string> = {
    maxActiveMembers: '最大活跃成员',
    defaultIsolationMode: '默认隔离模式',
    title: '标题',
    description: '描述',
    acceptanceCriteria: '验收标准',
    priority: '优先级',
    dependsOn: '依赖任务',
    reviewerMemberId: 'reviewer',
    verifierMemberId: 'verifier'
}

const PROJECT_ISOLATION_MODE_LABELS: Record<string, string> = {
    hybrid: 'Hybrid',
    all_simple: 'All simple'
}

const CONTROL_OWNER_LABELS: Record<string, string> = {
    manager: '经理',
    user: '用户'
}

export function getPayloadString(payload: TeamEventRecord['payload'], key: string): string | null {
    const value = payload?.[key]
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function getPayloadNumber(payload: TeamEventRecord['payload'], key: string): number | null {
    const value = payload?.[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function getPayloadStringArray(payload: TeamEventRecord['payload'], key: string): string[] {
    const value = payload?.[key]
    if (!Array.isArray(value)) {
        return []
    }
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

export function resolveMemberLabel(
    memberId: string | null | undefined,
    context: TeamEventPresentationContext
): string {
    if (!memberId) {
        return FALLBACK_MEMBER_LABEL
    }
    return context.memberLabelById?.get(memberId) ?? FALLBACK_MEMBER_LABEL
}

export function resolveTaskTitle(
    taskId: string | null | undefined,
    context: TeamEventPresentationContext
): string {
    if (!taskId) {
        return FALLBACK_TASK_TITLE
    }
    return context.taskTitleById?.get(taskId) ?? FALLBACK_TASK_TITLE
}

export function resolveEventTaskTitle(
    event: TeamEventRecord,
    context: TeamEventPresentationContext
): string {
    if (event.targetType === 'task') {
        return resolveTaskTitle(event.targetId, context)
    }
    return resolveTaskTitle(getPayloadString(event.payload, 'taskId'), context)
}

export function formatTaskStatus(status: string | null): string | null {
    if (!status) {
        return null
    }
    return TEAM_TASK_STATUS_LABELS[status as TeamTaskRecord['status']] ?? status
}

export function formatIsolationMode(mode: string | null): string | null {
    if (!mode) {
        return null
    }
    return PROJECT_ISOLATION_MODE_LABELS[mode] ?? mode
}

export function formatControlOwner(owner: string | null): string | null {
    if (!owner) {
        return null
    }
    return CONTROL_OWNER_LABELS[owner] ?? owner
}

export function formatUpdatedFields(payload: TeamEventRecord['payload']): string | null {
    const labels = getPayloadStringArray(payload, 'updatedFields')
        .map((field) => PROJECT_SETTING_FIELD_LABELS[field] ?? field)
    if (labels.length === 0) {
        return null
    }
    return labels.join('、')
}

export function joinDetailParts(parts: Array<string | null>): string | null {
    const filtered = parts.filter((part): part is string => typeof part === 'string' && part.length > 0)
    return filtered.length > 0 ? filtered.join('；') : null
}

export function formatProjectUpdatedDetail(payload: TeamEventRecord['payload']): string | null {
    const previousMaxActiveMembers = getPayloadNumber(payload, 'previousMaxActiveMembers')
    const nextMaxActiveMembers = getPayloadNumber(payload, 'nextMaxActiveMembers')
    const previousIsolationMode = formatIsolationMode(getPayloadString(payload, 'previousDefaultIsolationMode'))
    const nextIsolationMode = formatIsolationMode(getPayloadString(payload, 'nextDefaultIsolationMode'))

    return joinDetailParts([
        previousMaxActiveMembers !== null && nextMaxActiveMembers !== null
            ? `最大活跃成员：${previousMaxActiveMembers} -> ${nextMaxActiveMembers}`
            : null,
        previousIsolationMode && nextIsolationMode
            ? `默认隔离模式：${previousIsolationMode} -> ${nextIsolationMode}`
            : null
    ])
}

export function formatTaskCreateDetail(
    payload: TeamEventRecord['payload'],
    context: TeamEventPresentationContext
): string | null {
    return joinDetailParts([
        getPayloadString(payload, 'assigneeMemberId')
            ? `指派给 ${resolveMemberLabel(getPayloadString(payload, 'assigneeMemberId'), context)}`
            : null,
        getPayloadString(payload, 'reviewerMemberId')
            ? `reviewer：${resolveMemberLabel(getPayloadString(payload, 'reviewerMemberId'), context)}`
            : null,
        getPayloadString(payload, 'verifierMemberId')
            ? `verifier：${resolveMemberLabel(getPayloadString(payload, 'verifierMemberId'), context)}`
            : null
    ])
}

export function formatTaskAssignedDetail(
    payload: TeamEventRecord['payload'],
    context: TeamEventPresentationContext
): string | null {
    return joinDetailParts([
        getPayloadString(payload, 'fromAssigneeMemberId')
            ? `原负责人：${resolveMemberLabel(getPayloadString(payload, 'fromAssigneeMemberId'), context)}`
            : null,
        getPayloadString(payload, 'toAssigneeMemberId') || getPayloadString(payload, 'assigneeMemberId')
            ? `当前负责人：${resolveMemberLabel(
                getPayloadString(payload, 'toAssigneeMemberId') ?? getPayloadString(payload, 'assigneeMemberId'),
                context
            )}`
            : null,
        getPayloadString(payload, 'note')
    ])
}

export function formatTaskStatusChangedDetail(payload: TeamEventRecord['payload']): string | null {
    const fromStatus = formatTaskStatus(getPayloadString(payload, 'fromStatus'))
    const toStatus = formatTaskStatus(getPayloadString(payload, 'toStatus'))

    return joinDetailParts([
        fromStatus && toStatus ? `状态：${fromStatus} -> ${toStatus}` : null,
        getPayloadString(payload, 'note')
    ])
}

export function formatTaskUpdatedDetail(payload: TeamEventRecord['payload']): string | null {
    const updatedFields = formatUpdatedFields(payload)
    return joinDetailParts([
        updatedFields ? `已更新：${updatedFields}` : null,
        getPayloadString(payload, 'note')
    ])
}

export function formatMemberControlChangedDetail(payload: TeamEventRecord['payload']): string | null {
    const fromOwner = formatControlOwner(getPayloadString(payload, 'fromControlOwner'))
    const toOwner = formatControlOwner(getPayloadString(payload, 'toControlOwner'))

    return joinDetailParts([
        fromOwner && toOwner ? `控制权：${fromOwner} -> ${toOwner}` : null,
        getPayloadString(payload, 'summary'),
        getPayloadString(payload, 'note')
    ])
}
