import { memo } from 'react'
import { PlusIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { SessionListCount } from '@/components/session-list/SessionListCount'
import { getSessionTabButtonClassName } from '@/components/session-list/sessionListRenderHelpers'
import type { SessionListTab } from '@/components/session-list/sessionListUtils'

const SESSION_LIST_CONTROL_ROW_CLASS_NAME =
    'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2'
const SESSION_LIST_SEGMENTED_CONTROL_CLASS_NAME =
    'grid min-w-0 grid-cols-2 gap-2 rounded-[var(--ds-radius-lg)] border border-[var(--app-divider)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_94%,transparent)] p-1 shadow-[var(--ds-shadow-soft)]'
const SESSION_LIST_NEW_BUTTON_CLASS_NAME =
    'session-list-new-button h-[44px] w-[44px] rounded-[var(--ds-radius-md)] px-0 text-[var(--ds-text-primary)] shadow-[var(--ds-shadow-soft)] sm:w-auto sm:gap-2 sm:px-3'
const SESSION_LIST_COUNT_CLASS_NAME =
    'inline-flex min-w-[1.75rem] items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--ds-brand)_10%,transparent)] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-[color:color-mix(in_srgb,var(--ds-text-primary)_82%,var(--ds-brand)_18%)]'
const SESSION_LIST_CREATE_LABEL_BREAKPOINT_CLASS_NAME = 'hidden sm:inline'

type SessionListControlTab = {
    id: SessionListTab
    label: string
    count: number
}

type SessionListControlsProps = {
    activeTab: SessionListTab
    createLabel: string
    tabs: readonly SessionListControlTab[]
    onChange: (tabId: SessionListTab) => void
    onCreate: () => void
}

export const SessionListControls = memo(function SessionListControls(
    props: SessionListControlsProps
): React.JSX.Element {
    return (
        <div className={SESSION_LIST_CONTROL_ROW_CLASS_NAME}>
            <div className={SESSION_LIST_SEGMENTED_CONTROL_CLASS_NAME}>
                {props.tabs.map((tab) => (
                    <Button
                        key={tab.id}
                        type="button"
                        size="sm"
                        variant={props.activeTab === tab.id ? 'secondary' : 'ghost'}
                        onClick={() => props.onChange(tab.id)}
                        className={getSessionTabButtonClassName(props.activeTab === tab.id)}
                    >
                        <span>{tab.label}</span>
                        <SessionListCount
                            count={tab.count}
                            className={SESSION_LIST_COUNT_CLASS_NAME}
                        />
                    </Button>
                ))}
            </div>

            <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={props.onCreate}
                className={SESSION_LIST_NEW_BUTTON_CLASS_NAME}
                title={props.createLabel}
                aria-label={props.createLabel}
            >
                <PlusIcon className="h-4.5 w-4.5 text-[var(--ds-accent-lime)]" />
                <span className={SESSION_LIST_CREATE_LABEL_BREAKPOINT_CLASS_NAME}>
                    {props.createLabel}
                </span>
            </Button>
        </div>
    )
})
