import type {
    TeamEventRecord,
    TeamProject,
    TeamTaskRecord
} from '@/types/api'
import { AlertIcon } from '@/components/icons'
import {
    getTeamEventDetail,
    getTeamEventTitle
} from '@/components/teamHistoryPresentation'
import { Button } from '@/components/ui/button'

export type ProjectPanelTaskView = {
    id: string
    title: string
    status: TeamTaskRecord['status']
    acceptanceSummary: string
    updatedAt: number
}

type ProjectPanelMetricGridProps = {
    activeMemberCount: number
    runningMemberCount: number
    blockedTaskCount: number
    archivedMemberCount: number
}

type ProjectOpenTasksCardProps = {
    blockedTaskCount: number
    isLoading: boolean
    tasks: ProjectPanelTaskView[]
}

type ProjectAcceptanceResultsCardProps = {
    error: string | null
    isLoading: boolean
    events: TeamEventRecord[]
    taskTitleById: Map<string, string>
}

type ProjectSettingsCardProps = {
    maxActiveMembers: string
    defaultIsolationMode: TeamProject['defaultIsolationMode']
    isLoading: boolean
    isPending: boolean
    isReadonly: boolean
    isMemberLimitValid: boolean
    isSaveDisabled: boolean
    error: string | null
    onMaxActiveMembersChange: (value: string) => void
    onDefaultIsolationModeChange: (value: TeamProject['defaultIsolationMode']) => void
    onSave: () => void
}

const DEFAULT_METRIC_VALUE_CLASS_NAME = 'mt-1 text-lg font-semibold text-[var(--ds-text-primary)]'
const DANGER_METRIC_VALUE_CLASS_NAME = 'mt-1 text-lg font-semibold text-[var(--ds-danger)]'

function getTaskTone(status: TeamTaskRecord['status']): string {
    if (status === 'blocked') {
        return 'border-[color:color-mix(in_srgb,var(--ds-danger)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-danger)_10%,transparent)] text-[var(--ds-danger)]'
    }
    if (status === 'running' || status === 'in_review' || status === 'in_verification') {
        return 'border-[color:color-mix(in_srgb,var(--ds-brand)_24%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-brand)_10%,transparent)] text-[var(--ds-text-primary)]'
    }

    return 'border-[var(--ds-border-default)] bg-[var(--ds-panel)] text-[var(--app-hint)]'
}

function getAcceptanceEmptyStateText(props: ProjectAcceptanceResultsCardProps): string {
    if (props.error) {
        return props.error
    }
    if (props.isLoading) {
        return '正在加载验收结果…'
    }

    return '还没有验收结果'
}

function getAcceptanceEventPresentation(
    event: TeamEventRecord,
    taskTitleById: Map<string, string>
): {
    title: string
    detail: string | null
} {
    return {
        title: getTeamEventTitle(event, { taskTitleById }),
        detail: getTeamEventDetail(event, { taskTitleById })
    }
}

function getMetricValueClassName(tone: 'default' | 'danger' = 'default'): string {
    return tone === 'danger' ? DANGER_METRIC_VALUE_CLASS_NAME : DEFAULT_METRIC_VALUE_CLASS_NAME
}

export function ProjectPanelMetricGrid(props: ProjectPanelMetricGridProps): React.JSX.Element {
    return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricCard label="活跃成员" value={props.activeMemberCount} />
            <MetricCard label="运行中" value={props.runningMemberCount} />
            <MetricCard label="Blocked" value={props.blockedTaskCount} tone="danger" />
            <MetricCard label="历史成员" value={props.archivedMemberCount} />
        </div>
    )
}

export function ProjectOpenTasksCard(props: ProjectOpenTasksCardProps): React.JSX.Element {
    return (
        <div className="rounded-[1.2rem] border border-[var(--ds-border-default)] bg-[var(--ds-panel)] p-3">
            <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-[var(--ds-text-primary)]">Open Tasks</div>
                {props.blockedTaskCount ? (
                    <span className="inline-flex items-center gap-1 text-xs text-[var(--ds-danger)]">
                        <AlertIcon className="h-3.5 w-3.5" />
                        {props.blockedTaskCount} blocked
                    </span>
                ) : null}
            </div>
            <div className="mt-2 space-y-2">
                {props.tasks.length > 0 ? props.tasks.map((task) => (
                    <div
                        key={task.id}
                        className={`rounded-xl border px-3 py-2 text-xs ${getTaskTone(task.status)}`}
                    >
                        <div className="font-medium">{task.title}</div>
                        <div className="mt-1 opacity-80">{task.status}</div>
                        <div className="mt-1 text-[11px] opacity-90">{task.acceptanceSummary}</div>
                    </div>
                )) : (
                    <div className="text-xs text-[var(--app-hint)]">
                        {props.isLoading ? '正在加载任务…' : '当前没有开放任务'}
                    </div>
                )}
            </div>
        </div>
    )
}

export function ProjectSettingsCard(props: ProjectSettingsCardProps): React.JSX.Element {
    const settingsUnavailable = !props.isLoading && props.maxActiveMembers.length === 0

    return (
        <div className="rounded-[1.2rem] border border-[var(--ds-border-default)] bg-[var(--ds-panel)] p-3">
            <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-[var(--ds-text-primary)]">Project Settings</div>
                {props.isReadonly ? (
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--app-hint)]">
                        Read only
                    </span>
                ) : null}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--app-hint)]">
                Cap future active members and pick the default isolation mode for new spawns.
            </p>

            {settingsUnavailable ? (
                <div className="mt-3 text-xs text-[var(--app-hint)]">
                    Project settings are unavailable right now.
                </div>
            ) : (
                <div className="mt-3 space-y-3">
                    <label className="block">
                        <div className="text-xs font-medium text-[var(--ds-text-primary)]">Max active members</div>
                        <input
                            aria-label="Max active members"
                            type="number"
                            min={1}
                            step={1}
                            value={props.maxActiveMembers}
                            onChange={(event) => props.onMaxActiveMembersChange(event.target.value)}
                            disabled={props.isLoading || props.isPending || props.isReadonly}
                            className="mt-2 min-h-[46px] w-full rounded-[16px] border border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_96%,transparent)] px-3 py-2 text-sm font-medium text-[var(--ds-text-primary)] outline-none transition-[border-color,box-shadow] focus:border-[var(--ds-border-strong)] disabled:opacity-60"
                        />
                        <div className="mt-1 text-[11px] leading-relaxed text-[var(--app-hint)]">
                            Soft limit only. Existing active members stay intact; future spawns must fit under this cap.
                        </div>
                        {!props.isMemberLimitValid && !props.isLoading ? (
                            <div className="mt-1 text-[11px] text-[var(--ds-danger)]">
                                Use a whole number above 0.
                            </div>
                        ) : null}
                    </label>

                    <label className="block">
                        <div className="text-xs font-medium text-[var(--ds-text-primary)]">Default isolation</div>
                        <select
                            aria-label="Default isolation"
                            value={props.defaultIsolationMode}
                            onChange={(event) => props.onDefaultIsolationModeChange(
                                event.target.value as TeamProject['defaultIsolationMode']
                            )}
                            disabled={props.isLoading || props.isPending || props.isReadonly}
                            className="mt-2 min-h-[46px] w-full rounded-[16px] border border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_96%,transparent)] px-3 py-2 text-sm font-medium text-[var(--ds-text-primary)] outline-none transition-[border-color,box-shadow] focus:border-[var(--ds-border-strong)] disabled:opacity-60"
                        >
                            <option value="hybrid">Hybrid</option>
                            <option value="all_simple">All simple</option>
                        </select>
                        <div className="mt-1 text-[11px] leading-relaxed text-[var(--app-hint)]">
                            Hybrid keeps implementer/debugger on worktrees. All simple forces future members onto simple sessions.
                        </div>
                    </label>

                    {props.error ? (
                        <div className="rounded-[1rem] border border-[color:color-mix(in_srgb,var(--ds-danger)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-danger)_10%,transparent)] px-3 py-2 text-xs text-[var(--ds-danger)]">
                            {props.error}
                        </div>
                    ) : null}

                    <div className="flex justify-end">
                        <Button
                            type="button"
                            size="sm"
                            onClick={props.onSave}
                            disabled={props.isSaveDisabled}
                        >
                            {props.isPending ? 'Saving…' : 'Save settings'}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}

export function ProjectAcceptanceResultsCard(
    props: ProjectAcceptanceResultsCardProps
): React.JSX.Element {
    return (
        <div className="rounded-[1.2rem] border border-[var(--ds-border-default)] bg-[var(--ds-panel)] p-3">
            <div className="text-sm font-medium text-[var(--ds-text-primary)]">Recent Acceptance</div>
            <div className="mt-2 space-y-2">
                {props.events.length > 0 ? props.events.map((event) => {
                    const presentation = getAcceptanceEventPresentation(event, props.taskTitleById)

                    return (
                        <div key={event.id} className="text-xs text-[var(--app-hint)]">
                            <div className="font-medium text-[var(--app-fg)]">
                                {presentation.title}
                            </div>
                            {presentation.detail ? (
                                <div className="mt-1">{presentation.detail}</div>
                            ) : null}
                        </div>
                    )
                }) : (
                    <div className="text-xs text-[var(--app-hint)]">
                        {getAcceptanceEmptyStateText(props)}
                    </div>
                )}
            </div>
        </div>
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
            <div className={getMetricValueClassName(props.tone)}>
                {props.value}
            </div>
        </div>
    )
}
