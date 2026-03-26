import { useMemo } from 'react'
import type { ApiClient } from '@/api/client'
import type {
    Session,
    TeamEventRecord,
    TeamTaskRecord
} from '@/types/api'
import { AlertIcon, UsersIcon } from '@/components/icons'
import { useTeamProject } from '@/hooks/queries/useTeamProject'

function getTaskTone(task: TeamTaskRecord): string {
    if (task.status === 'blocked') {
        return 'border-[color:color-mix(in_srgb,var(--ds-danger)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-danger)_10%,transparent)] text-[var(--ds-danger)]'
    }
    if (task.status === 'running' || task.status === 'in_review' || task.status === 'in_verification') {
        return 'border-[color:color-mix(in_srgb,var(--ds-brand)_24%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-brand)_10%,transparent)] text-[var(--ds-text-primary)]'
    }

    return 'border-[var(--ds-border-default)] bg-[var(--ds-panel)] text-[var(--app-hint)]'
}

function renderEventLine(event: TeamEventRecord): string {
    switch (event.kind) {
        case 'user-interjected':
            return '用户插话'
        case 'user-takeover-started':
            return '用户接管成员'
        case 'user-takeover-ended':
            return '用户归还经理'
        case 'member-spawned':
            return '成员已加入'
        case 'review-requested':
            return '已发起 review'
        case 'verification-requested':
            return '已发起 verification'
        default:
            return event.kind
    }
}

export function ProjectPanel(props: {
    api: ApiClient
    session: Session
}): React.JSX.Element | null {
    const teamContext = props.session.teamContext
    const projectId = teamContext?.sessionRole === 'manager' ? teamContext.projectId : null
    const { snapshot, isLoading, error } = useTeamProject(props.api, projectId)

    const activeMembers = useMemo(() => {
        return snapshot?.members.filter((member) => member.membershipState === 'active') ?? []
    }, [snapshot])
    const focusTasks = useMemo(() => {
        return (snapshot?.tasks ?? [])
            .filter((task) => task.status !== 'done' && task.status !== 'canceled' && task.status !== 'failed')
            .slice(0, 4)
    }, [snapshot])
    const recentEvents = useMemo(() => {
        return (snapshot?.events ?? []).slice(0, 3)
    }, [snapshot])

    if (!teamContext || teamContext.sessionRole !== 'manager') {
        return null
    }

    return (
        <section className="mx-3 mt-3 overflow-hidden rounded-[1.6rem] border border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_92%,transparent)] shadow-[var(--ds-shadow-soft)]">
            <div className="border-b border-[var(--ds-border-default)] px-4 py-3">
                <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--app-hint)]">
                    <UsersIcon className="h-4 w-4 text-[var(--ds-brand)]" />
                    Manager Project
                </div>
                <div className="mt-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-base font-semibold text-[var(--ds-text-primary)]">
                            {snapshot?.project.title ?? teamContext.managerTitle ?? 'Manager Project'}
                        </h2>
                        <p className="mt-1 text-sm text-[var(--app-hint)]">
                            {snapshot?.project.goal ?? '经理会话正在编排成员、任务和交付。'}
                        </p>
                    </div>
                    <span className="rounded-full border border-[var(--ds-border-default)] bg-[var(--ds-panel)] px-2.5 py-1 text-xs font-medium text-[var(--app-hint)]">
                        {teamContext.projectStatus}
                    </span>
                </div>
            </div>

            <div className="grid gap-3 px-4 py-3 md:grid-cols-[1.2fr_1fr]">
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <MetricCard label="活跃成员" value={teamContext.activeMemberCount ?? 0} />
                        <MetricCard label="运行中" value={teamContext.runningMemberCount ?? 0} />
                        <MetricCard label="Blocked" value={teamContext.blockedTaskCount ?? 0} tone="danger" />
                        <MetricCard label="历史成员" value={teamContext.archivedMemberCount ?? 0} />
                    </div>

                    <div className="rounded-[1.2rem] border border-[var(--ds-border-default)] bg-[var(--ds-panel)] p-3">
                        <div className="text-sm font-medium text-[var(--ds-text-primary)]">Active Roster</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {activeMembers.length > 0 ? activeMembers.map((member) => (
                                <span
                                    key={member.id}
                                    className="rounded-full border border-[var(--ds-border-default)] bg-[var(--ds-panel-strong)] px-2.5 py-1 text-xs text-[var(--app-fg)]"
                                >
                                    {member.role} · r{member.revision}
                                </span>
                            )) : (
                                <span className="text-xs text-[var(--app-hint)]">
                                    {isLoading ? '正在加载成员…' : '还没有活跃成员'}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="rounded-[1.2rem] border border-[var(--ds-border-default)] bg-[var(--ds-panel)] p-3">
                        <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium text-[var(--ds-text-primary)]">Open Tasks</div>
                            {teamContext.blockedTaskCount ? (
                                <span className="inline-flex items-center gap-1 text-xs text-[var(--ds-danger)]">
                                    <AlertIcon className="h-3.5 w-3.5" />
                                    {teamContext.blockedTaskCount} blocked
                                </span>
                            ) : null}
                        </div>
                        <div className="mt-2 space-y-2">
                            {focusTasks.length > 0 ? focusTasks.map((task) => (
                                <div
                                    key={task.id}
                                    className={`rounded-xl border px-3 py-2 text-xs ${getTaskTone(task)}`}
                                >
                                    <div className="font-medium">{task.title}</div>
                                    <div className="mt-1 opacity-80">{task.status}</div>
                                </div>
                            )) : (
                                <div className="text-xs text-[var(--app-hint)]">
                                    {isLoading ? '正在加载任务…' : '当前没有开放任务'}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="rounded-[1.2rem] border border-[var(--ds-border-default)] bg-[var(--ds-panel)] p-3">
                        <div className="text-sm font-medium text-[var(--ds-text-primary)]">Recent Team Events</div>
                        <div className="mt-2 space-y-2">
                            {recentEvents.length > 0 ? recentEvents.map((event) => (
                                <div key={event.id} className="text-xs text-[var(--app-hint)]">
                                    <span className="font-medium text-[var(--app-fg)]">{renderEventLine(event)}</span>
                                </div>
                            )) : (
                                <div className="text-xs text-[var(--app-hint)]">
                                    {error ?? (isLoading ? '正在加载事件…' : '还没有团队事件')}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}

function MetricCard(props: {
    label: string
    value: number
    tone?: 'default' | 'danger'
}): React.JSX.Element {
    return (
        <div className="rounded-[1.1rem] border border-[var(--ds-border-default)] bg-[var(--ds-panel)] px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--app-hint)]">{props.label}</div>
            <div className={props.tone === 'danger' ? 'mt-1 text-lg font-semibold text-[var(--ds-danger)]' : 'mt-1 text-lg font-semibold text-[var(--ds-text-primary)]'}>
                {props.value}
            </div>
        </div>
    )
}
