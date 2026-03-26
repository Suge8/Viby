import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { ApiClient } from '@/api/client'
import type {
    Session,
    TeamControlOwner,
    TeamMemberRecord,
    TeamTaskRecord
} from '@/types/api'
import { AppNotice } from '@/components/AppNotice'
import { LockIcon, MessageSquareIcon, OpenIcon, UsersIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useTeamMemberControlActions } from '@/hooks/mutations/useTeamMemberControlActions'
import { useTeamProject } from '@/hooks/queries/useTeamProject'

function resolveCurrentTask(member: TeamMemberRecord | null, tasks: TeamTaskRecord[]): TeamTaskRecord | null {
    if (!member) {
        return null
    }

    if (member.spawnedForTaskId) {
        return tasks.find((task) => task.id === member.spawnedForTaskId) ?? null
    }

    return tasks.find((task) => task.assigneeMemberId === member.id && task.status !== 'done') ?? null
}

function renderControlOwner(controlOwner: TeamControlOwner | undefined): string {
    return controlOwner === 'user' ? '用户接管中' : '当前由经理管理'
}

export function MemberControlBanner(props: {
    api: ApiClient
    session: Session
}): React.JSX.Element | null {
    const navigate = useNavigate()
    const [interjectOpen, setInterjectOpen] = useState(false)
    const [draft, setDraft] = useState('')
    const teamContext = props.session.teamContext
    const projectId = teamContext?.sessionRole === 'member' ? teamContext.projectId : null
    const { snapshot } = useTeamProject(props.api, projectId)

    const target = useMemo(() => {
        if (!teamContext || teamContext.sessionRole !== 'member' || !teamContext.memberId) {
            return null
        }

        return {
            memberId: teamContext.memberId,
            projectId: teamContext.projectId,
            sessionId: props.session.id,
            managerSessionId: teamContext.managerSessionId
        }
    }, [props.session.id, teamContext])
    const controls = useTeamMemberControlActions(props.api, target)

    const member = useMemo(() => {
        if (!teamContext?.memberId) {
            return null
        }

        return snapshot?.members.find((candidate) => candidate.id === teamContext.memberId) ?? null
    }, [snapshot, teamContext?.memberId])
    const currentTask = useMemo(() => resolveCurrentTask(member, snapshot?.tasks ?? []), [member, snapshot?.tasks])

    const handleManagerNavigation = useCallback(() => {
        if (!teamContext) {
            return
        }

        void navigate({
            to: '/sessions/$sessionId',
            params: {
                sessionId: teamContext.managerSessionId
            }
        })
    }, [navigate, teamContext])

    const handleInterjectSubmit = useCallback(async () => {
        const text = draft.trim()
        if (!text) {
            return
        }

        await controls.interject({ text })
        setDraft('')
        setInterjectOpen(false)
    }, [controls, draft])

    if (!teamContext || teamContext.sessionRole !== 'member') {
        return null
    }

    const controlOwner = teamContext.controlOwner ?? 'manager'
    const isReadOnly = controlOwner !== 'user'

    return (
        <section className="mx-3 mt-3 overflow-hidden rounded-[1.6rem] border border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_92%,transparent)] shadow-[var(--ds-shadow-soft)]">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--ds-border-default)] px-4 py-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--app-hint)]">
                        <UsersIcon className="h-4 w-4 text-[var(--ds-brand)]" />
                        Member Control
                    </div>
                    <h2 className="mt-2 text-base font-semibold text-[var(--ds-text-primary)]">
                        {teamContext.memberRole ?? 'member'} · r{teamContext.memberRevision ?? 1}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--app-hint)]">
                        经理：{teamContext.managerTitle ?? 'Manager'} · {renderControlOwner(controlOwner)}
                    </p>
                </div>
                <span className={isReadOnly ? 'rounded-full border border-[color:color-mix(in_srgb,var(--ds-warning)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-warning)_10%,transparent)] px-2.5 py-1 text-xs font-medium text-[var(--ds-warning)]' : 'rounded-full border border-[color:color-mix(in_srgb,var(--ds-success)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-success)_10%,transparent)] px-2.5 py-1 text-xs font-medium text-[var(--ds-success)]'}>
                    {isReadOnly ? '只读观察' : '可连续控制'}
                </span>
            </div>

            <div className="space-y-3 px-4 py-3">
                <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
                    <div className="space-y-1 text-sm text-[var(--app-hint)]">
                        <div>当前任务：<span className="font-medium text-[var(--app-fg)]">{currentTask?.title ?? '尚未分配'}</span></div>
                        <div>项目状态：<span className="font-medium text-[var(--app-fg)]">{teamContext.projectStatus}</span></div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {controlOwner === 'manager' ? (
                            <>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setInterjectOpen((current) => !current)}
                                    disabled={controls.isPending}
                                >
                                    <MessageSquareIcon className="mr-1.5 h-4 w-4" />
                                    插话一次
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void controls.takeOver()}
                                    disabled={controls.isPending}
                                >
                                    <LockIcon className="mr-1.5 h-4 w-4" />
                                    接管成员
                                </Button>
                            </>
                        ) : (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void controls.returnToManager()}
                                disabled={controls.isPending}
                            >
                                归还经理
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleManagerNavigation}
                            disabled={controls.isPending}
                        >
                            <OpenIcon className="mr-1.5 h-4 w-4" />
                            查看经理
                        </Button>
                    </div>
                </div>

                {interjectOpen ? (
                    <div className="rounded-[1.2rem] border border-[var(--ds-border-default)] bg-[var(--ds-panel)] p-3">
                        <div className="text-sm font-medium text-[var(--ds-text-primary)]">插话一次</div>
                        <p className="mt-1 text-xs text-[var(--app-hint)]">
                            这只会插入一条高优先级用户消息，不会把长期 owner 从经理切走。
                        </p>
                        <textarea
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            rows={3}
                            className="mt-3 w-full rounded-[1rem] border border-[var(--ds-border-default)] bg-[var(--ds-panel-strong)] px-3 py-2 text-sm text-[var(--app-fg)] outline-none transition focus:border-[var(--ds-brand)]"
                            placeholder="告诉这个成员你现在要插入的那一条指令"
                        />
                        <div className="mt-3 flex justify-end gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setInterjectOpen(false)
                                    setDraft('')
                                }}
                                disabled={controls.isPending}
                            >
                                取消
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => void handleInterjectSubmit()}
                                disabled={controls.isPending || draft.trim().length === 0}
                            >
                                发送插话
                            </Button>
                        </div>
                    </div>
                ) : null}

                {isReadOnly ? (
                    <AppNotice
                        layout="inline"
                        tone="warning"
                        icon={<LockIcon className="h-4 w-4" />}
                        title="成员当前由经理管理，底部输入区保持只读。"
                        description="如需只插一句，用上面的“插话一次”；如需连续多轮交互，先接管成员。"
                    />
                ) : (
                    <AppNotice
                        layout="inline"
                        tone="success"
                        title="你正在直接控制这个成员。"
                        description="完成后记得“归还经理”，让团队编排继续接管。"
                    />
                )}

                {controls.error ? (
                    <AppNotice
                        layout="inline"
                        tone="danger"
                        title="成员控制动作失败"
                        description={controls.error}
                    />
                ) : null}
            </div>
        </section>
    )
}
