import type { SessionSummary } from '@/types/api'
import { SessionListAnimatedItem } from '@/components/session-list/SessionListAnimatedItem'
import type {
    SessionListManagerGroupState,
    SessionListRenderContext
} from '@/components/session-list/sessionListContracts'
import { SessionListManagerGroup } from '@/components/session-list/SessionListManagerGroup'
import { SessionListSectionHeader } from '@/components/session-list/SessionListSectionHeader'
import type {
    SessionListRow,
    SessionListSection
} from '@/components/session-list/sessionListUtils'

const SESSION_LIST_SECTION_STACK_CLASS_NAME = 'flex flex-col gap-4 px-3 pb-4 pt-1'
const SESSION_LIST_ARCHIVE_STACK_CLASS_NAME = 'flex flex-col gap-2 px-3 pb-4 pt-1'
const SESSION_LIST_SECTION_CARD_STACK_CLASS_NAME = 'flex flex-col gap-2'

type SessionMainViewProps = {
    sections: readonly SessionListSection[]
    managerGroups: SessionListManagerGroupState
    renderContext: SessionListRenderContext
    emptyLabel: string
    t: (key: string, params?: Record<string, string | number>) => string
}

type SessionArchiveViewProps = {
    sessions: readonly SessionSummary[]
    renderContext: SessionListRenderContext
    emptyLabel: string
}

export function SessionMainView(props: SessionMainViewProps): React.JSX.Element {
    if (props.sections.length === 0) {
        return (
            <div className={SESSION_LIST_SECTION_STACK_CLASS_NAME}>
                <SessionListEmptyState label={props.emptyLabel} />
            </div>
        )
    }

    return (
        <div className={SESSION_LIST_SECTION_STACK_CLASS_NAME}>
            {props.sections.map((section) => (
                <section key={section.id} className="flex flex-col gap-2">
                    <SessionListSectionHeader
                        count={section.count}
                        label={props.t(section.titleKey)}
                    />
                    <div className={SESSION_LIST_SECTION_CARD_STACK_CLASS_NAME}>
                        {section.rows.map((row) => renderSessionListRow(row, props.renderContext, props.managerGroups))}
                    </div>
                </section>
            ))}
        </div>
    )
}

export function SessionArchiveView(props: SessionArchiveViewProps): React.JSX.Element {
    return (
        <div className={SESSION_LIST_ARCHIVE_STACK_CLASS_NAME}>
            {props.sessions.length === 0 ? (
                <SessionListEmptyState label={props.emptyLabel} />
            ) : (
                props.sessions.map((session) => (
                    <SessionListAnimatedItem
                        key={session.id}
                        session={session}
                        hasUnseenReply={props.renderContext.hasUnseenReply(session)}
                        selection={props.renderContext.selection}
                        onOpenActionMenu={props.renderContext.onOpenActionMenu}
                    />
                ))
            )}
        </div>
    )
}

function SessionListEmptyState(props: { label: string }): React.JSX.Element {
    return (
        <div className="rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--app-divider)] px-4 py-6 text-sm text-[var(--app-hint)]">
            {props.label}
        </div>
    )
}

function renderSessionListRow(
    row: SessionListRow,
    renderContext: SessionListRenderContext,
    managerGroups: SessionListManagerGroupState
): React.JSX.Element {
    if (row.kind === 'manager-group') {
        return (
            <SessionListManagerGroup
                key={row.id}
                group={row}
                renderContext={renderContext}
                managerGroups={managerGroups}
            />
        )
    }

    return (
        <SessionListAnimatedItem
            key={row.id}
            session={row.session}
            hasUnseenReply={renderContext.hasUnseenReply(row.session)}
            selection={renderContext.selection}
            onOpenActionMenu={renderContext.onOpenActionMenu}
        />
    )
}
