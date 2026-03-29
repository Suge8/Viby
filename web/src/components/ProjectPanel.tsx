import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { isTerminalTeamTaskStatus } from '@viby/protocol'
import type { ApiClient } from '@/api/client'
import type {
    Session,
    TeamProject,
} from '@/types/api'
import { ArchiveIcon, SettingsIcon, UsersIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
    ProjectAcceptanceResultsCard,
    ProjectOpenTasksCard,
    ProjectSettingsCard,
    ProjectPanelMetricGrid,
    type ProjectPanelTaskView,
} from '@/components/projectPanelSections'
import {
    getProjectPanelTaskPriority,
    getProjectSettingsErrorMessage,
    getRequiredTaskAcceptance,
    getTaskAcceptanceSummary,
    parsePositiveInt,
} from '@/components/projectPanelSupport'
import { useTeamProject } from '@/hooks/queries/useTeamProject'
import {
    buildTeamRoleCatalog,
    getTeamMemberLabel,
} from '@/lib/teamMemberPresentation'

const LazyTeamHistoryDrawer = lazy(async () => {
    const module = await import('@/components/TeamHistoryDrawer')
    return { default: module.TeamHistoryDrawer }
})

const LazyTeamRoleManagerDialog = lazy(async () => {
    const module = await import('@/components/TeamRoleManagerDialog')
    return { default: module.TeamRoleManagerDialog }
})

export function ProjectPanel(props: {
    api: ApiClient
    session: Session
}): React.JSX.Element | null {
    const [historyOpen, setHistoryOpen] = useState(false)
    const [roleManagerOpen, setRoleManagerOpen] = useState(false)
    const [draftMaxActiveMembers, setDraftMaxActiveMembers] = useState('')
    const [draftIsolationMode, setDraftIsolationMode] = useState<TeamProject['defaultIsolationMode']>('hybrid')
    const [savePending, setSavePending] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const teamContext = props.session.teamContext
    const managerSessionId = teamContext?.managerSessionId ?? null
    const projectId = teamContext?.sessionRole === 'manager' ? teamContext.projectId : null
    const { snapshot, isLoading, error, refetch } = useTeamProject(props.api, projectId)

    const activeMembers = useMemo(() => {
        return snapshot?.members.filter((member) => member.membershipState === 'active') ?? []
    }, [snapshot])
    const focusTasks = useMemo<ProjectPanelTaskView[]>(() => {
        if (!snapshot) {
            return []
        }
        return snapshot.tasks
            .filter((task) => !isTerminalTeamTaskStatus(task.status))
            .map((task) => ({
                id: task.id,
                title: task.title,
                status: task.status,
                acceptanceSummary: getTaskAcceptanceSummary(getRequiredTaskAcceptance(snapshot, task.id)),
                updatedAt: task.updatedAt,
            }))
            .sort((left, right) => {
                const statusDelta = getProjectPanelTaskPriority(left.status) - getProjectPanelTaskPriority(right.status)
                if (statusDelta !== 0) {
                    return statusDelta
                }

                return right.updatedAt - left.updatedAt
            })
            .slice(0, 4)
    }, [snapshot])
    const taskTitleById = useMemo(() => {
        return new Map((snapshot?.tasks ?? []).map((task) => [task.id, task.title]))
    }, [snapshot])
    const roleCatalog = useMemo(() => {
        return buildTeamRoleCatalog(snapshot?.roles ?? [])
    }, [snapshot?.roles])
    const recentAcceptanceResults = useMemo(() => {
        return snapshot?.acceptance.recentResults.slice(0, 4) ?? []
    }, [snapshot])
    const parsedMaxActiveMembers = parsePositiveInt(draftMaxActiveMembers)
    const projectStatus = snapshot?.project.status ?? teamContext?.projectStatus ?? 'active'
    const settingsReadOnly = projectStatus !== 'active'
    const settingsDirty = snapshot
        ? parsedMaxActiveMembers !== snapshot.project.maxActiveMembers
            || draftIsolationMode !== snapshot.project.defaultIsolationMode
        : false
    const saveDisabled = !projectId
        || !snapshot
        || savePending
        || settingsReadOnly
        || parsedMaxActiveMembers === null
        || !settingsDirty

    useEffect(() => {
        if (!snapshot?.project) {
            return
        }

        setDraftMaxActiveMembers(String(snapshot.project.maxActiveMembers))
        setDraftIsolationMode(snapshot.project.defaultIsolationMode)
        setSaveError(null)
    }, [
        snapshot?.project?.defaultIsolationMode,
        snapshot?.project?.maxActiveMembers,
        snapshot?.project?.updatedAt,
    ])

    const handleSaveSettings = useCallback(async () => {
        if (!projectId || !snapshot || !managerSessionId || parsedMaxActiveMembers === null || settingsReadOnly) {
            return
        }

        setSavePending(true)
        setSaveError(null)
        try {
            await props.api.updateTeamProjectSettings(projectId, {
                managerSessionId,
                maxActiveMembers: parsedMaxActiveMembers,
                defaultIsolationMode: draftIsolationMode,
            })
            await refetch()
        } catch (saveSettingsError) {
            setSaveError(getProjectSettingsErrorMessage(saveSettingsError))
        } finally {
            setSavePending(false)
        }
    }, [
        draftIsolationMode,
        managerSessionId,
        parsedMaxActiveMembers,
        projectId,
        props.api,
        refetch,
        settingsReadOnly,
        snapshot,
    ])

    if (!teamContext || teamContext.sessionRole !== 'manager') {
        return null
    }

    return (
        <>
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
                            {projectStatus}
                        </span>
                    </div>
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRoleManagerOpen(true)}
                        >
                            <SettingsIcon className="mr-1.5 h-4 w-4" />
                            管理角色
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setHistoryOpen(true)}
                        >
                            <ArchiveIcon className="mr-1.5 h-4 w-4" />
                            查看历史
                        </Button>
                    </div>
                </div>

                <div className="grid gap-3 px-4 py-3 md:grid-cols-[1.2fr_1fr]">
                    <div className="space-y-3">
                        <ProjectPanelMetricGrid
                            activeMemberCount={teamContext.activeMemberCount ?? 0}
                            runningMemberCount={teamContext.runningMemberCount ?? 0}
                            blockedTaskCount={teamContext.blockedTaskCount ?? 0}
                            archivedMemberCount={teamContext.archivedMemberCount ?? 0}
                        />

                        <ProjectSettingsCard
                            maxActiveMembers={draftMaxActiveMembers}
                            defaultIsolationMode={draftIsolationMode}
                            isLoading={isLoading}
                            isPending={savePending}
                            isReadonly={settingsReadOnly}
                            isMemberLimitValid={parsedMaxActiveMembers !== null}
                            isSaveDisabled={saveDisabled}
                            error={saveError}
                            onMaxActiveMembersChange={setDraftMaxActiveMembers}
                            onDefaultIsolationModeChange={setDraftIsolationMode}
                            onSave={() => {
                                void handleSaveSettings()
                            }}
                        />

                        <div className="rounded-[1.2rem] border border-[var(--ds-border-default)] bg-[var(--ds-panel)] p-3">
                            <div className="text-sm font-medium text-[var(--ds-text-primary)]">Active Roster</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {activeMembers.length > 0 ? activeMembers.map((member) => (
                                    <span
                                        key={member.id}
                                        className="rounded-full border border-[var(--ds-border-default)] bg-[var(--ds-panel-strong)] px-2.5 py-1 text-xs text-[var(--app-fg)]"
                                    >
                                        {getTeamMemberLabel(member, roleCatalog)}
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
                        <ProjectOpenTasksCard
                            blockedTaskCount={teamContext.blockedTaskCount ?? 0}
                            isLoading={isLoading}
                            tasks={focusTasks}
                        />

                        <ProjectAcceptanceResultsCard
                            error={error}
                            isLoading={isLoading}
                            events={recentAcceptanceResults}
                            taskTitleById={taskTitleById}
                        />
                    </div>
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
                        />
                    ) : null}
                    {roleManagerOpen && managerSessionId ? (
                        <LazyTeamRoleManagerDialog
                            api={props.api}
                            open={roleManagerOpen}
                            onOpenChange={setRoleManagerOpen}
                            snapshot={snapshot}
                            managerSessionId={managerSessionId}
                            onSnapshotChanged={async () => {
                                await refetch()
                            }}
                        />
                    ) : null}
                </Suspense>
            ) : null}
        </>
    )
}
