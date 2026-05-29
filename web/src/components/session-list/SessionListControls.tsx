import { memo } from 'react'
import { FeatureSearchIcon } from '@/components/featureIcons'
import { MotionStaggerGroup, MotionStaggerItem } from '@/components/motion/motionPrimitives'
import { SessionListCount } from '@/components/session-list/SessionListCount'
import { getSessionTabButtonClassName } from '@/components/session-list/sessionListRenderHelpers'
import type { SessionListSectionId } from '@/components/session-list/sessionListUtils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const SESSION_LIST_CONTROL_ROW_CLASS_NAME = 'flex min-w-0 flex-col gap-2'
const SESSION_LIST_SEGMENTED_CONTROL_CLASS_NAME =
    'ds-session-list-native-controls grid min-w-0 w-full grid-cols-2 gap-2 rounded-[var(--ds-radius-lg)] border p-1'
const SESSION_LIST_COUNT_CLASS_NAME =
    'ds-session-list-count-badge inline-flex items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--ds-brand)_10%,transparent)] px-1.5 py-0.5 font-semibold tabular-nums text-[color:color-mix(in_srgb,var(--ds-text-primary)_82%,var(--ds-brand)_18%)]'
const SESSION_LIST_SEARCH_CLASS_NAME =
    'min-h-9 rounded-[var(--ds-radius-md)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_92%,transparent)] py-2 pl-9 pr-3 text-xs'

type SessionListControlTab = {
    id: SessionListSectionId
    label: string
    count: number | null
}

type SessionListControlsModel = {
    activeTab: SessionListSectionId
    ariaLabel: string
    searchLabel: string
    searchPlaceholder: string
    searchValue: string
    tabs: readonly SessionListControlTab[]
}

type SessionListControlsActions = {
    onChange: (tabId: SessionListSectionId) => void
    onSearchChange: (value: string) => void
}

type SessionListControlsProps = {
    actions: SessionListControlsActions
    model: SessionListControlsModel
}

export const SessionListControls = memo(function SessionListControls(
    props: SessionListControlsProps
): React.JSX.Element {
    const { actions, model } = props

    return (
        <MotionStaggerGroup className={SESSION_LIST_CONTROL_ROW_CLASS_NAME} delay={0.02} stagger={0.05}>
            <MotionStaggerItem y={10}>
                <div className={SESSION_LIST_SEGMENTED_CONTROL_CLASS_NAME} role="tablist" aria-label={model.ariaLabel}>
                    {model.tabs.map((tab) => {
                        const active = model.activeTab === tab.id
                        return (
                            <Button
                                key={tab.id}
                                type="button"
                                size="sm"
                                variant={active ? 'secondary' : 'ghost'}
                                pressStyle="segmented"
                                role="tab"
                                aria-selected={active}
                                onClick={() => actions.onChange(tab.id)}
                                className={getSessionTabButtonClassName(active)}
                            >
                                <span>{tab.label}</span>
                                <SessionListCount count={tab.count} className={SESSION_LIST_COUNT_CLASS_NAME} />
                            </Button>
                        )
                    })}
                </div>
            </MotionStaggerItem>

            <MotionStaggerItem y={10}>
                <label className="relative block">
                    <span className="sr-only">{model.searchLabel}</span>
                    <FeatureSearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-muted)]" />
                    <Input
                        type="search"
                        value={model.searchValue}
                        onChange={(event) => actions.onSearchChange(event.target.value)}
                        placeholder={model.searchPlaceholder}
                        className={SESSION_LIST_SEARCH_CLASS_NAME}
                    />
                </label>
            </MotionStaggerItem>
        </MotionStaggerGroup>
    )
})
