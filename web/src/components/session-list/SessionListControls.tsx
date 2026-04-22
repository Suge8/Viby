import { memo } from 'react'
import { PlusIcon } from '@/components/icons'
import { MotionStaggerGroup, MotionStaggerItem } from '@/components/motion/motionPrimitives'
import { SessionListCount } from '@/components/session-list/SessionListCount'
import { getSessionTabButtonClassName } from '@/components/session-list/sessionListRenderHelpers'
import type { SessionListSectionId } from '@/components/session-list/sessionListUtils'
import { Button } from '@/components/ui/button'
import { useDesktopSessionsLayout } from '@/hooks/useDesktopSessionsLayout'
import { SESSION_LIST_CREATE_BUTTON_TEST_ID } from '@/lib/sessionUiContracts'

const SESSION_LIST_CONTROL_ROW_CLASS_NAME =
    'relative min-w-0 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-2'
const SESSION_LIST_SEGMENTED_CONTROL_CLASS_NAME =
    'grid min-w-0 w-full grid-cols-2 gap-2 rounded-[var(--ds-radius-lg)] border border-[var(--app-divider)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_94%,transparent)] p-1 shadow-[var(--ds-shadow-soft)]'
const SESSION_LIST_NEW_BUTTON_CLASS_NAME =
    'session-list-new-button ds-session-list-new-button rounded-[var(--ds-radius-md)] px-0 text-[var(--ds-text-primary)] shadow-[var(--ds-shadow-soft)] sm:gap-2 sm:px-3'
const SESSION_LIST_COUNT_CLASS_NAME =
    'ds-session-list-count-badge inline-flex items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--ds-brand)_10%,transparent)] px-1.5 py-0.5 font-semibold tabular-nums text-[color:color-mix(in_srgb,var(--ds-text-primary)_82%,var(--ds-brand)_18%)]'
const SESSION_LIST_CREATE_LABEL_BREAKPOINT_CLASS_NAME = 'hidden sm:inline'

type SessionListControlTab = {
    id: SessionListSectionId
    label: string
    count: number
}

type SessionListControlsModel = {
    activeTab: SessionListSectionId
    ariaLabel: string
    createLabel: string
    tabs: readonly SessionListControlTab[]
}

type SessionListControlsActions = {
    onChange: (tabId: SessionListSectionId) => void
    onCreate: () => void
}

type SessionListControlsProps = {
    actions: SessionListControlsActions
    model: SessionListControlsModel
}

export const SessionListControls = memo(function SessionListControls(
    props: SessionListControlsProps
): React.JSX.Element {
    const { actions, model } = props
    const isDesktopLayout = useDesktopSessionsLayout()

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
                                role="tab"
                                aria-selected={active}
                                disabled={tab.count === 0}
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

            {isDesktopLayout ? (
                <MotionStaggerItem y={10} x={10}>
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={actions.onCreate}
                        data-testid={SESSION_LIST_CREATE_BUTTON_TEST_ID}
                        className={SESSION_LIST_NEW_BUTTON_CLASS_NAME}
                        title={model.createLabel}
                        aria-label={model.createLabel}
                    >
                        <PlusIcon className="h-4.5 w-4.5 text-[var(--ds-accent-lime)]" />
                        <span className={SESSION_LIST_CREATE_LABEL_BREAKPOINT_CLASS_NAME}>{model.createLabel}</span>
                    </Button>
                </MotionStaggerItem>
            ) : null}
        </MotionStaggerGroup>
    )
})
