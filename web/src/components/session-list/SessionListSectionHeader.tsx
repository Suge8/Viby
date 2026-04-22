import { memo } from 'react'
import { SessionListCount } from '@/components/session-list/SessionListCount'

const SESSION_LIST_SECTION_HEADER_CLASS_NAME = 'flex items-center gap-2 px-1'
const SESSION_LIST_SECTION_TITLE_CLASS_NAME =
    'ds-session-list-section-title text-xs font-semibold uppercase text-[var(--app-hint)]'
const SESSION_LIST_SECTION_COUNT_CLASS_NAME =
    'ds-session-list-section-count inline-flex items-center justify-center rounded-full px-1.5 py-0.5 font-semibold tabular-nums text-[color:color-mix(in_srgb,var(--app-hint)_82%,var(--ds-text-primary)_18%)]'

type SessionListSectionHeaderProps = {
    count: number
    label: string
}

export const SessionListSectionHeader = memo(function SessionListSectionHeader(
    props: SessionListSectionHeaderProps
): React.JSX.Element {
    return (
        <div className={SESSION_LIST_SECTION_HEADER_CLASS_NAME}>
            <h2 className={SESSION_LIST_SECTION_TITLE_CLASS_NAME}>{props.label}</h2>
            <SessionListCount count={props.count} className={SESSION_LIST_SECTION_COUNT_CLASS_NAME} />
        </div>
    )
})
