import { MotionStaggerGroup, MotionStaggerItem } from '@/components/motion/motionPrimitives'
import { SessionListAnimatedItem } from '@/components/session-list/SessionListAnimatedItem'
import { SessionListSectionHeader } from '@/components/session-list/SessionListSectionHeader'
import type { SessionListRenderContext } from '@/components/session-list/sessionListContracts'
import type { SessionListSection } from '@/components/session-list/sessionListUtils'
import { Button } from '@/components/ui/button'

const SESSION_LIST_SECTION_STACK_CLASS_NAME = 'flex flex-col gap-4 px-3 pb-4 pt-1'
const SESSION_LIST_SECTION_CARD_STACK_CLASS_NAME = 'flex flex-col gap-2'

type SessionListViewProps = {
    activeSection: SessionListSection | null
    renderContext: SessionListRenderContext
    emptyLabel: string
    onShowAll: () => void
    showAllLabel: string
    t: (key: string, params?: Record<string, string | number>) => string
}

export function SessionListView(props: SessionListViewProps): React.JSX.Element {
    if (!props.activeSection) {
        return (
            <div className={SESSION_LIST_SECTION_STACK_CLASS_NAME}>
                <MotionStaggerGroup stagger={0.05}>
                    <MotionStaggerItem y={16}>
                        <SessionListEmptyState label={props.emptyLabel} />
                    </MotionStaggerItem>
                </MotionStaggerGroup>
            </div>
        )
    }

    return (
        <div className={SESSION_LIST_SECTION_STACK_CLASS_NAME}>
            <MotionStaggerGroup className="flex flex-col gap-2" delay={0.01} stagger={0.055}>
                <MotionStaggerItem y={12}>
                    <SessionListSectionHeader
                        count={props.activeSection.count}
                        label={props.t(props.activeSection.titleKey)}
                    />
                </MotionStaggerItem>
                {props.activeSection.rows.length === 0 ? (
                    <MotionStaggerItem y={16}>
                        <SessionListEmptyState label={props.emptyLabel} />
                    </MotionStaggerItem>
                ) : (
                    <div className={SESSION_LIST_SECTION_CARD_STACK_CLASS_NAME}>
                        {props.activeSection.rows.map((row, rowIndex) => (
                            <MotionStaggerItem key={row.id} x={rowIndex % 2 === 0 ? -18 : 18} y={8} scaleFrom={0.992}>
                                <SessionListAnimatedItem
                                    session={row.session}
                                    hasUnseenReply={props.renderContext.hasUnseenReply(row.session)}
                                    selection={props.renderContext.selection}
                                    onOpenActionMenu={props.renderContext.onOpenActionMenu}
                                />
                            </MotionStaggerItem>
                        ))}
                    </div>
                )}
                {props.activeSection.hiddenCount > 0 ? (
                    <MotionStaggerItem y={8}>
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            pressStyle="chip"
                            onClick={props.onShowAll}
                            className="w-full rounded-[var(--ds-radius-lg)] text-xs text-[var(--ds-text-secondary)]"
                        >
                            {props.showAllLabel}
                        </Button>
                    </MotionStaggerItem>
                ) : null}
            </MotionStaggerGroup>
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
