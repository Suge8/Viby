import type { TeamEventRecord } from '@/types/api'
import {
    FALLBACK_MEMBER_LABEL,
    formatMemberControlChangedDetail,
    formatProjectUpdatedDetail,
    formatTaskAssignedDetail,
    formatTaskCreateDetail,
    formatTaskUpdatedDetail,
    formatTaskStatusChangedDetail,
    getPayloadString,
    joinDetailParts,
    resolveEventTaskTitle,
    resolveMemberLabel,
    resolveTaskTitle,
    type TeamEventPresentationContext
} from '@/components/teamHistoryPresentationSupport'

export function getTeamEventTitle(
    event: TeamEventRecord,
    context: TeamEventPresentationContext = {}
): string {
    const memberLabel = resolveMemberLabel(event.targetType === 'member' ? event.targetId : null, context)
    const taskTitle = resolveEventTaskTitle(event, context)
    const assigneeLabel = resolveMemberLabel(
        getPayloadString(event.payload, 'toAssigneeMemberId') ?? getPayloadString(event.payload, 'assigneeMemberId'),
        context
    )

    switch (event.kind) {
        case 'project-created':
            return '项目已创建'
        case 'project-updated':
            return '项目设置已更新'
        case 'project-delivered':
            return '项目已交付'
        case 'project-archived':
            return '项目已归档'
        case 'project-reopened':
            return '项目已恢复'
        case 'member-spawned':
            return `${memberLabel} 已加入团队`
        case 'member-control-changed':
            return `${memberLabel} 控制权已变更`
        case 'member-archived':
            return `${memberLabel} 已归档`
        case 'member-restored':
            return `${memberLabel} 已恢复`
        case 'member-removed':
            return `${memberLabel} 已移出团队`
        case 'member-replaced':
            return `${memberLabel} 已进入 revision 替换`
        case 'task-created':
            return `任务「${taskTitle}」已创建`
        case 'task-updated':
            return `任务「${taskTitle}」已更新`
        case 'task-assigned':
            return assigneeLabel === FALLBACK_MEMBER_LABEL
                ? `任务「${taskTitle}」已完成分配`
                : `任务「${taskTitle}」已分配给 ${assigneeLabel}`
        case 'task-status-changed':
            return `任务「${taskTitle}」状态已更新`
        case 'task-commented':
            return `任务「${taskTitle}」新增备注`
        case 'broadcast-sent':
            return '经理已发送团队广播'
        case 'direct-message-sent':
            return `${memberLabel} 收到经理消息`
        case 'user-interjected':
            return `${memberLabel} 收到一次用户插话`
        case 'user-takeover-started':
            return `${memberLabel} 已切到用户接管`
        case 'user-takeover-ended':
            return `${memberLabel} 已归还经理`
        case 'review-requested':
            return `任务「${taskTitle}」已发起 review`
        case 'review-passed':
            return `任务「${taskTitle}」review 通过`
        case 'review-failed':
            return `任务「${taskTitle}」review 要求修改`
        case 'verification-requested':
            return `任务「${taskTitle}」已发起 verification`
        case 'verification-passed':
            return `任务「${taskTitle}」verification 通过`
        case 'verification-failed':
            return `任务「${taskTitle}」verification 未通过`
        case 'manager-accepted':
            return `任务「${taskTitle}」经理已验收`
        default:
            return '团队事件已记录'
    }
}

export function getTeamEventDetail(
    event: TeamEventRecord,
    context: TeamEventPresentationContext = {}
): string | null {
    switch (event.kind) {
        case 'project-updated':
            return formatProjectUpdatedDetail(event.payload)
        case 'project-reopened':
            return joinDetailParts([
                getPayloadString(event.payload, 'status')
                    ? `项目状态：${getPayloadString(event.payload, 'status')}`
                    : null
            ])
        case 'member-spawned':
            return joinDetailParts([
                getPayloadString(event.payload, 'taskId')
                    ? `关联任务：${resolveTaskTitle(getPayloadString(event.payload, 'taskId'), context)}`
                    : null
            ])
        case 'member-control-changed':
            return formatMemberControlChangedDetail(event.payload)
        case 'member-replaced':
            return joinDetailParts([
                getPayloadString(event.payload, 'supersedesMemberId')
                    ? `接替 ${resolveMemberLabel(getPayloadString(event.payload, 'supersedesMemberId'), context)}`
                    : null,
                getPayloadString(event.payload, 'summary')
            ])
        case 'task-created':
            return formatTaskCreateDetail(event.payload, context)
        case 'task-updated':
            return formatTaskUpdatedDetail(event.payload)
        case 'task-assigned':
            return formatTaskAssignedDetail(event.payload, context)
        case 'task-status-changed':
            return formatTaskStatusChangedDetail(event.payload)
        case 'task-commented':
            return joinDetailParts([
                getPayloadString(event.payload, 'comment'),
                getPayloadString(event.payload, 'summary'),
                getPayloadString(event.payload, 'text')
            ])
        case 'broadcast-sent':
        case 'direct-message-sent':
        case 'user-interjected':
        case 'user-takeover-ended':
        case 'project-delivered':
        case 'review-passed':
        case 'review-failed':
        case 'verification-passed':
        case 'verification-failed':
            return joinDetailParts([
                getPayloadString(event.payload, 'summary'),
                getPayloadString(event.payload, 'text')
            ])
        case 'review-requested':
            return joinDetailParts([
                getPayloadString(event.payload, 'reviewerMemberId')
                    ? `reviewer：${resolveMemberLabel(getPayloadString(event.payload, 'reviewerMemberId'), context)}`
                    : null,
                getPayloadString(event.payload, 'note')
            ])
        case 'verification-requested':
            return joinDetailParts([
                getPayloadString(event.payload, 'verifierMemberId')
                    ? `verifier：${resolveMemberLabel(getPayloadString(event.payload, 'verifierMemberId'), context)}`
                    : null,
                getPayloadString(event.payload, 'note')
            ])
        case 'manager-accepted':
            return joinDetailParts([
                getPayloadString(event.payload, 'summary'),
                getPayloadString(event.payload, 'skipVerificationReason')
            ])
        default:
            return null
    }
}
