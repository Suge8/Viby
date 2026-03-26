import { Button } from '@/components/ui/button'
import type { SessionListManagerGroupRow } from '@/components/session-list/sessionListUtils'
import { SessionListAnimatedItem } from '@/components/session-list/SessionListAnimatedItem'
import type {
    SessionListManagerGroupState,
    SessionListRenderContext
} from '@/components/session-list/sessionListContracts'
import { useTranslation } from '@/lib/use-translation'

const GROUP_SUMMARY_ROW_CLASS_NAME = 'ml-4 flex flex-wrap items-center justify-between gap-2 pr-1'
const GROUP_CHIP_LIST_CLASS_NAME = 'flex flex-wrap items-center gap-1.5'
const GROUP_MEMBERS_STACK_CLASS_NAME =
    'ml-6 flex flex-col gap-2 border-l border-[var(--app-divider)] pl-3'
const GROUP_CHIP_CLASS_NAME =
    'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em]'
const GROUP_TOGGLE_BUTTON_CLASS_NAME =
    'min-h-[32px] rounded-full px-3 text-[11px] font-semibold text-[var(--ds-text-primary)]'

type TeamProjectStatus = 'active' | 'delivered' | 'archived' | undefined

type SessionListManagerGroupProps = {
    group: SessionListManagerGroupRow
    managerGroups: SessionListManagerGroupState
    renderContext: SessionListRenderContext
}

export function SessionListManagerGroup(props: SessionListManagerGroupProps): React.JSX.Element {
    const { t } = useTranslation()
    const team = props.group.manager.team
    const expanded = props.managerGroups.expandedManagerGroups[props.group.manager.id] ?? false
    const activeMemberCount = team?.activeMemberCount ?? props.group.members.length
    const runningMemberCount = team?.runningMemberCount ?? 0
    const blockedTaskCount = team?.blockedTaskCount ?? 0
    const archivedMemberCount = team?.archivedMemberCount ?? 0
    const toggleLabel = expanded
        ? t('sessions.group.hideMembers')
        : t('sessions.group.showMembers', { count: props.group.members.length })

    return (
        <div className="flex flex-col gap-2">
            <SessionListAnimatedItem
                session={props.group.manager}
                hasUnseenReply={props.renderContext.hasUnseenReply(props.group.manager)}
                selection={props.renderContext.selection}
                onOpenActionMenu={props.renderContext.onOpenActionMenu}
            />

            <div className={GROUP_SUMMARY_ROW_CLASS_NAME}>
                <div className={GROUP_CHIP_LIST_CLASS_NAME}>
                    <SummaryChip
                        className="bg-[color:color-mix(in_srgb,var(--ds-brand)_12%,transparent)] text-[var(--ds-brand)]"
                        label={t('sessions.group.team')}
                    />
                    <SummaryChip
                        className={getProjectStatusChipClassName(team?.projectStatus)}
                        label={t(getProjectStatusLabelKey(team?.projectStatus))}
                    />
                    <SummaryChip
                        className="bg-[var(--app-subtle-bg)] text-[var(--app-hint)]"
                        label={t('sessions.group.activeMembers', { count: activeMemberCount })}
                    />
                    <SummaryChip
                        className="bg-[color:color-mix(in_srgb,var(--ds-accent-lime)_12%,transparent)] text-[var(--ds-text-primary)]"
                        label={t('sessions.group.runningMembers', { count: runningMemberCount })}
                    />
                    <SummaryChip
                        className="bg-[color:color-mix(in_srgb,var(--ds-accent-coral)_12%,transparent)] text-[var(--ds-accent-coral)]"
                        label={t('sessions.group.blockedTasks', { count: blockedTaskCount })}
                    />
                    {archivedMemberCount > 0 ? (
                        <SummaryChip
                            className="bg-[var(--app-subtle-bg)] text-[var(--app-hint)]"
                            label={t('sessions.group.archivedMembers', { count: archivedMemberCount })}
                        />
                    ) : null}
                </div>

                {props.group.members.length > 0 ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className={GROUP_TOGGLE_BUTTON_CLASS_NAME}
                        onClick={() => props.managerGroups.onToggleManagerGroup(props.group.manager.id)}
                        aria-expanded={expanded}
                    >
                        {toggleLabel}
                    </Button>
                ) : null}
            </div>

            {expanded ? (
                <div className={GROUP_MEMBERS_STACK_CLASS_NAME}>
                    {props.group.members.map((member) => (
                        <SessionListAnimatedItem
                            key={member.id}
                            session={member}
                            hasUnseenReply={props.renderContext.hasUnseenReply(member)}
                            selection={props.renderContext.selection}
                            onOpenActionMenu={props.renderContext.onOpenActionMenu}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    )
}

function SummaryChip(props: { className: string; label: string }): React.JSX.Element {
    return (
        <span className={`${GROUP_CHIP_CLASS_NAME} ${props.className}`}>
            {props.label}
        </span>
    )
}

function getProjectStatusLabelKey(status: TeamProjectStatus): string {
    switch (status) {
        case 'delivered':
            return 'sessions.group.project.delivered'
        case 'archived':
            return 'sessions.group.project.archived'
        default:
            return 'sessions.group.project.active'
    }
}

function getProjectStatusChipClassName(status: TeamProjectStatus): string {
    switch (status) {
        case 'delivered':
            return 'bg-[color:color-mix(in_srgb,var(--ds-accent-lime)_14%,transparent)] text-[var(--ds-text-primary)]'
        case 'archived':
            return 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)]'
        default:
            return 'bg-[color:color-mix(in_srgb,var(--ds-brand)_12%,transparent)] text-[var(--ds-text-primary)]'
    }
}
