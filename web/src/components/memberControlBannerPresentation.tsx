import type {
    TeamControlOwner,
    TeamMemberRecord,
    TeamTaskRecord
} from '@/types/api'
import { ArchiveIcon, LockIcon, MessageSquareIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'

const READ_ONLY_BADGE_CLASS_NAME = 'rounded-full border border-[color:color-mix(in_srgb,var(--ds-warning)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-warning)_10%,transparent)] px-2.5 py-1 text-xs font-medium text-[var(--ds-warning)]'
const CONTROLLABLE_BADGE_CLASS_NAME = 'rounded-full border border-[color:color-mix(in_srgb,var(--ds-success)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-success)_10%,transparent)] px-2.5 py-1 text-xs font-medium text-[var(--ds-success)]'

export type MemberControlViewState = {
    isHistoricalMember: boolean
    isReadOnly: boolean
    badgeClassName: string
    badgeLabel: string
    noticeTone: 'warning' | 'success'
    noticeTitle: string
    noticeDescription: string
    noticeIcon?: React.JSX.Element
}

export function resolveCurrentTask(
    member: TeamMemberRecord | null,
    tasks: TeamTaskRecord[]
): TeamTaskRecord | null {
    if (!member) {
        return null
    }

    if (member.spawnedForTaskId) {
        return tasks.find((task) => task.id === member.spawnedForTaskId) ?? null
    }

    return tasks.find((task) => task.assigneeMemberId === member.id && task.status !== 'done') ?? null
}

export function renderControlOwner(controlOwner: TeamControlOwner | undefined): string {
    return controlOwner === 'user' ? '用户接管中' : '当前由经理管理'
}

function renderMembershipState(state: TeamMemberRecord['membershipState'] | undefined): string {
    switch (state) {
        case 'archived':
            return '已归档'
        case 'removed':
            return '已移出'
        case 'superseded':
            return '已被新 revision 替换'
        default:
            return '活跃成员'
    }
}

export function resolveMemberControlViewState(
    membershipState: TeamMemberRecord['membershipState'],
    controlOwner: TeamControlOwner
): MemberControlViewState {
    if (membershipState !== 'active') {
        const membershipLabel = renderMembershipState(membershipState)
        return {
            isHistoricalMember: true,
            isReadOnly: true,
            badgeClassName: READ_ONLY_BADGE_CLASS_NAME,
            badgeLabel: membershipLabel,
            noticeTone: 'warning',
            noticeTitle: `该成员当前处于${membershipLabel}状态。`,
            noticeDescription: 'active roster 已不再接收它；需要回溯上下文时请看团队历史，若只是 archived member，可显式恢复后再继续。',
            noticeIcon: <ArchiveIcon className="h-4 w-4" />
        }
    }

    if (controlOwner !== 'user') {
        return {
            isHistoricalMember: false,
            isReadOnly: true,
            badgeClassName: READ_ONLY_BADGE_CLASS_NAME,
            badgeLabel: '只读观察',
            noticeTone: 'warning',
            noticeTitle: '成员当前由经理管理，底部输入区保持只读。',
            noticeDescription: '如需只插一句，用上面的“插话一次”；如需连续多轮交互，先接管成员。',
            noticeIcon: <LockIcon className="h-4 w-4" />
        }
    }

    return {
        isHistoricalMember: false,
        isReadOnly: false,
        badgeClassName: CONTROLLABLE_BADGE_CLASS_NAME,
        badgeLabel: '可连续控制',
        noticeTone: 'success',
        noticeTitle: '你正在直接控制这个成员。',
        noticeDescription: '完成后记得“归还经理”，让团队编排继续接管。'
    }
}

export function renderMemberControlActions(options: {
    controlOwner: TeamControlOwner
    isHistoricalMember: boolean
    isPending: boolean
    onToggleInterject: () => void
    onTakeOver: () => void
    onReturnToManager: () => void
}): React.JSX.Element | null {
    if (options.isHistoricalMember) {
        return null
    }

    if (options.controlOwner === 'user') {
        return (
            <Button
                variant="outline"
                size="sm"
                onClick={options.onReturnToManager}
                disabled={options.isPending}
            >
                归还经理
            </Button>
        )
    }

    return (
        <>
            <Button
                variant="secondary"
                size="sm"
                onClick={options.onToggleInterject}
                disabled={options.isPending}
            >
                <MessageSquareIcon className="mr-1.5 h-4 w-4" />
                插话一次
            </Button>
            <Button
                variant="outline"
                size="sm"
                onClick={options.onTakeOver}
                disabled={options.isPending}
            >
                <LockIcon className="mr-1.5 h-4 w-4" />
                接管成员
            </Button>
        </>
    )
}
