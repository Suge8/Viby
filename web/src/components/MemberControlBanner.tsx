import { Suspense, lazy, useCallback, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { ApiClient } from '@/api/client'
import type { Session, TeamControlOwner } from '@/types/api'
import { AppNotice } from '@/components/AppNotice'
import { ArchiveIcon, OpenIcon, UsersIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useTeamMemberControlActions } from '@/hooks/mutations/useTeamMemberControlActions'
import { useTeamProject } from '@/hooks/queries/useTeamProject'
import {
    renderControlOwner,
    renderMemberControlActions,
    resolveCurrentTask,
    resolveMemberControlViewState
} from '@/components/memberControlBannerPresentation'
import { getMemberSessionTitle } from '@/lib/sessionPresentation'

const LazyTeamHistoryDrawer = lazy(async () => {
    const module = await import('@/components/TeamHistoryDrawer')
    return { default: module.TeamHistoryDrawer }
})

export function MemberControlBanner(props: {
    api: ApiClient
    session: Session
}): React.JSX.Element | null {
    const navigate = useNavigate()
    const [historyOpen, setHistoryOpen] = useState(false)
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
    const membershipState = member?.membershipState ?? teamContext?.membershipState ?? 'active'
    const controlOwner: TeamControlOwner = membershipState === 'active'
        ? (member?.controlOwner ?? teamContext?.controlOwner ?? 'manager')
        : 'manager'
    const viewState = resolveMemberControlViewState(membershipState, controlOwner)
    const canSubmitInterject = draft.trim().length > 0

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

    const handleInterjectToggle = useCallback(() => {
        setInterjectOpen((current) => !current)
    }, [])

    const handleInterjectCancel = useCallback(() => {
        setInterjectOpen(false)
        setDraft('')
    }, [])

    const handleTakeOver = useCallback(() => {
        void controls.takeOver()
    }, [controls])

    const handleReturnToManager = useCallback(() => {
        void controls.returnToManager()
    }, [controls])

    if (!teamContext || teamContext.sessionRole !== 'member') {
        return null
    }

    return (
        <>
            <section className="mx-3 mt-3 overflow-hidden rounded-[1.6rem] border border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_92%,transparent)] shadow-[var(--ds-shadow-soft)]">
                <div className="flex items-start justify-between gap-3 border-b border-[var(--ds-border-default)] px-4 py-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--app-hint)]">
                            <UsersIcon className="h-4 w-4 text-[var(--ds-brand)]" />
                            Member Control
                        </div>
                        <h2 className="mt-2 text-base font-semibold text-[var(--ds-text-primary)]">
                            {getMemberSessionTitle(teamContext) ?? 'member'}
                        </h2>
                        <p className="mt-1 text-sm text-[var(--app-hint)]">
                            经理：{teamContext.managerTitle ?? 'Manager'} · {renderControlOwner(controlOwner)}
                        </p>
                    </div>
                    <span className={viewState.badgeClassName}>
                        {viewState.badgeLabel}
                    </span>
                </div>

                <div className="space-y-3 px-4 py-3">
                    <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
                        <div className="space-y-1 text-sm text-[var(--app-hint)]">
                            <div>当前任务：<span className="font-medium text-[var(--app-fg)]">{currentTask?.title ?? '尚未分配'}</span></div>
                            <div>项目状态：<span className="font-medium text-[var(--app-fg)]">{teamContext.projectStatus}</span></div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {renderMemberControlActions({
                                controlOwner,
                                isHistoricalMember: viewState.isHistoricalMember,
                                isPending: controls.isPending,
                                onToggleInterject: handleInterjectToggle,
                                onTakeOver: handleTakeOver,
                                onReturnToManager: handleReturnToManager
                            })}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setHistoryOpen(true)}
                            >
                                <ArchiveIcon className="mr-1.5 h-4 w-4" />
                                查看历史
                            </Button>
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

                    {interjectOpen && !viewState.isHistoricalMember ? (
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
                                    onClick={handleInterjectCancel}
                                    disabled={controls.isPending}
                                >
                                    取消
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={() => void handleInterjectSubmit()}
                                    disabled={controls.isPending || !canSubmitInterject}
                                >
                                    发送插话
                                </Button>
                            </div>
                        </div>
                    ) : null}

                    <AppNotice
                        layout="inline"
                        tone={viewState.noticeTone}
                        icon={viewState.noticeIcon}
                        title={viewState.noticeTitle}
                        description={viewState.noticeDescription}
                    />

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
            {projectId ? (
                <Suspense fallback={null}>
                    {historyOpen ? (
                        <LazyTeamHistoryDrawer
                            api={props.api}
                            open={historyOpen}
                            onOpenChange={setHistoryOpen}
                            projectId={projectId}
                            snapshot={snapshot}
                            currentMemberId={teamContext.memberId}
                        />
                    ) : null}
                </Suspense>
            ) : null}
        </>
    )
}
