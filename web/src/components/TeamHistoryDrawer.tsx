import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type {
    ApiClient
} from '@/api/client'
import type {
    TeamMemberRecord,
    TeamProjectSnapshot
} from '@/types/api'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { ArchiveIcon, OpenIcon } from '@/components/icons'
import {
    getTeamEventDetail,
    getTeamEventTitle
} from '@/components/teamHistoryPresentation'
import { Button } from '@/components/ui/button'
import { useTeamProjectHistory } from '@/hooks/queries/useTeamProjectHistory'
import {
    buildTeamMemberLabelMap,
    buildTeamRoleCatalog,
    getTeamMemberLabel,
} from '@/lib/teamMemberPresentation'

type TeamHistoryDrawerProps = {
    api: ApiClient
    open: boolean
    onOpenChange: (open: boolean) => void
    projectId: string
    snapshot: TeamProjectSnapshot | null
    currentMemberId?: string
}

const HISTORY_MEMBER_STATES: ReadonlySet<TeamMemberRecord['membershipState']> = new Set([
    'archived',
    'removed',
    'superseded'
])

function formatMemberState(state: TeamMemberRecord['membershipState']): string {
    switch (state) {
        case 'archived':
            return '已归档'
        case 'removed':
            return '已移出'
        case 'superseded':
            return '已被新 revision 替换'
        default:
            return '活跃'
    }
}

function formatTimestamp(createdAt: number): string {
    return new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).format(createdAt)
}

export function TeamHistoryDrawer(props: TeamHistoryDrawerProps): React.JSX.Element {
    const {
        api,
        currentMemberId,
        onOpenChange,
        open,
        projectId,
        snapshot
    } = props
    const navigate = useNavigate()
    const [restoringMemberId, setRestoringMemberId] = useState<string | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)
    const { history, isLoading, error } = useTeamProjectHistory(api, projectId, open)

    const historicalMembers = useMemo(() => {
        return (snapshot?.members ?? []).filter((member) => HISTORY_MEMBER_STATES.has(member.membershipState))
    }, [snapshot])
    const memberById = useMemo(() => {
        return new Map((snapshot?.members ?? []).map((member) => [member.id, member]))
    }, [snapshot])
    const roleCatalog = useMemo(() => {
        return buildTeamRoleCatalog(snapshot?.roles ?? [])
    }, [snapshot?.roles])
    const memberLabelById = useMemo(() => {
        return buildTeamMemberLabelMap(snapshot?.members ?? [], roleCatalog)
    }, [snapshot?.members, roleCatalog])
    const taskTitleById = useMemo(() => {
        return new Map((snapshot?.tasks ?? []).map((task) => [task.id, task.title]))
    }, [snapshot])
    const timeline = useMemo(() => {
        return (history?.events ?? []).slice().sort((left, right) => left.createdAt - right.createdAt)
    }, [history?.events])
    const managerSessionId = snapshot?.project.managerSessionId ?? null

    const handleOpenSession = useCallback((sessionId: string) => {
        setActionError(null)
        onOpenChange(false)
        void navigate({
            to: '/sessions/$sessionId',
            params: {
                sessionId
            }
        })
    }, [navigate, onOpenChange])

    const handleRestoreMember = useCallback(async (member: TeamMemberRecord) => {
        if (!api || member.membershipState !== 'archived') {
            return
        }

        setActionError(null)
        setRestoringMemberId(member.id)
        try {
            const restoredSession = await api.unarchiveSession(member.sessionId)
            onOpenChange(false)
            void navigate({
                to: '/sessions/$sessionId',
                params: {
                    sessionId: restoredSession.id
                }
            })
        } catch (nextError) {
            setActionError(nextError instanceof Error ? nextError.message : '恢复历史成员失败。')
        } finally {
            setRestoringMemberId(null)
        }
    }, [api, navigate, onOpenChange])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl overflow-hidden p-0">
                <DialogHeader className="border-b border-[var(--ds-border-default)] px-6 py-4 text-left">
                    <DialogTitle>Team History</DialogTitle>
                    <DialogDescription>
                        查看历史成员状态，以及基于 authoritative team events 的结构化时间线。
                    </DialogDescription>
                    {managerSessionId ? (
                        <div className="mt-3 flex justify-end">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenSession(managerSessionId)}
                                aria-label="打开经理会话"
                            >
                                <OpenIcon className="mr-1.5 h-4 w-4" />
                                打开经理会话
                            </Button>
                        </div>
                    ) : null}
                </DialogHeader>

                <div className="grid max-h-[75vh] gap-0 overflow-hidden md:grid-cols-[320px_1fr]">
                    <section className="border-b border-[var(--ds-border-default)] bg-[var(--ds-panel)] px-5 py-4 md:border-b-0 md:border-r">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-hint)]">
                            历史成员
                        </div>
                        {actionError ? (
                            <div className="mt-3 rounded-[1rem] border border-[color:color-mix(in_srgb,var(--ds-danger)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-danger)_10%,transparent)] px-3 py-3 text-sm text-[var(--ds-danger)]">
                                {actionError}
                            </div>
                        ) : null}
                        <div className="mt-3 space-y-2">
                            {historicalMembers.length > 0 ? historicalMembers.map((member) => {
                                const highlighted = member.id === currentMemberId
                                const memberLabel = memberLabelById.get(member.id) ?? getTeamMemberLabel(member, roleCatalog)
                                const lineageAnchor = member.supersedesMemberId
                                    ? memberById.get(member.supersedesMemberId)
                                    : null
                                const lineageAnchorLabel = lineageAnchor
                                    ? (memberLabelById.get(lineageAnchor.id) ?? getTeamMemberLabel(lineageAnchor, roleCatalog))
                                    : null

                                return (
                                    <div
                                        key={member.id}
                                        className={highlighted
                                            ? 'rounded-[1rem] border border-[color:color-mix(in_srgb,var(--ds-brand)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-brand)_10%,transparent)] px-3 py-2 text-sm'
                                            : 'rounded-[1rem] border border-[var(--ds-border-default)] bg-[var(--ds-panel-strong)] px-3 py-2 text-sm'}
                                    >
                                        <div className="font-medium text-[var(--ds-text-primary)]">
                                            {memberLabel}
                                        </div>
                                        <div className="mt-1 text-xs text-[var(--app-hint)]">
                                            {formatMemberState(member.membershipState)}
                                        </div>
                                        {lineageAnchorLabel ? (
                                            <div className="mt-1 text-xs text-[var(--app-hint)]">
                                                源自 {lineageAnchorLabel}
                                            </div>
                                        ) : null}
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleOpenSession(member.sessionId)}
                                                aria-label={`打开 ${memberLabel} 会话`}
                                            >
                                                <OpenIcon className="mr-1.5 h-4 w-4" />
                                                打开会话
                                            </Button>
                                            {member.membershipState === 'archived' ? (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => void handleRestoreMember(member)}
                                                    disabled={restoringMemberId === member.id || !api}
                                                    aria-label={`恢复 ${memberLabel}`}
                                                >
                                                    <ArchiveIcon className="mr-1.5 h-4 w-4" />
                                                    {restoringMemberId === member.id ? '恢复中…' : '恢复成员'}
                                                </Button>
                                            ) : null}
                                        </div>
                                    </div>
                                )
                            }) : (
                                <div className="rounded-[1rem] border border-dashed border-[var(--ds-border-default)] px-3 py-4 text-sm text-[var(--app-hint)]">
                                    目前还没有 archived / removed / superseded 成员。
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="min-h-0 overflow-y-auto bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_92%,transparent)] px-5 py-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-hint)]">
                            时间线
                        </div>
                        <div className="mt-3 space-y-3">
                            {error ? (
                                <div className="rounded-[1rem] border border-[color:color-mix(in_srgb,var(--ds-danger)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-danger)_10%,transparent)] px-3 py-3 text-sm text-[var(--ds-danger)]">
                                    {error}
                                </div>
                            ) : null}
                            {!error && timeline.length === 0 ? (
                                <div className="rounded-[1rem] border border-dashed border-[var(--ds-border-default)] px-3 py-4 text-sm text-[var(--app-hint)]">
                                    {isLoading ? '正在加载团队历史…' : '还没有可展示的 team timeline。'}
                                </div>
                            ) : null}
                            {timeline.map((event) => {
                                const detail = getTeamEventDetail(event, {
                                    memberLabelById,
                                    taskTitleById
                                })

                                return (
                                    <div
                                        key={event.id}
                                        className="rounded-[1rem] border border-[var(--ds-border-default)] bg-[var(--ds-panel)] px-3 py-3"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="text-sm font-medium text-[var(--ds-text-primary)]">
                                                {getTeamEventTitle(event, {
                                                    memberLabelById,
                                                    taskTitleById
                                                })}
                                            </div>
                                            <div className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-[var(--app-hint)]">
                                                {formatTimestamp(event.createdAt)}
                                            </div>
                                        </div>
                                        {detail ? (
                                            <div className="mt-2 text-sm text-[var(--app-hint)]">
                                                {detail}
                                            </div>
                                        ) : null}
                                    </div>
                                )
                            })}
                        </div>
                    </section>
                </div>
            </DialogContent>
        </Dialog>
    )
}
