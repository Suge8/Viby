import type { ReactNode } from 'react'
import { COMPOSER_CONTROL_OPTION_BUTTON_CLASS_NAME } from '@/components/AssistantChat/composerControlPresentation'
import { Spinner } from '@/components/Spinner'
import { Button } from '@/components/ui/button'
import { DisclosureCardSection, DisclosureCardSummary } from '@/components/ui/DisclosureCardSection'
import { getInteractiveCardClassName } from '@/components/ui/interactiveCardStyles'
import { cn } from '@/lib/utils'

type ComposerActionItem = {
    key: string
    label: string
    pendingLabel?: string
    icon: ReactNode
    disabled: boolean
    pending?: boolean
    testId?: string
    onSelect: () => void
}

type ComposerActionSectionProps = {
    currentDriver?: string | null
    icon: ReactNode
    testId?: string
    title: string
    summary?: string | null
    items: readonly ComposerActionItem[]
}

export function ComposerActionSection(props: ComposerActionSectionProps): ReactNode {
    return (
        <div data-testid={props.testId} data-current-driver={props.currentDriver ?? undefined}>
            <DisclosureCardSection
                triggerContent={<DisclosureCardSummary icon={props.icon} title={props.title} summary={props.summary} />}
                panelClassName="px-0.5 pt-1"
                panelInnerClassName="grid grid-cols-2 gap-1"
            >
                {props.items.map((item) => (
                    <Button
                        key={item.key}
                        data-testid={item.testId}
                        type="button"
                        variant="plain"
                        size="sm"
                        disabled={item.disabled}
                        className={cn(
                            getInteractiveCardClassName('disclosure-trigger'),
                            COMPOSER_CONTROL_OPTION_BUTTON_CLASS_NAME,
                            item.disabled ? 'cursor-not-allowed opacity-50' : ''
                        )}
                        aria-busy={item.pending === true}
                        onClick={item.onSelect}
                        onMouseDown={(event) => event.preventDefault()}
                    >
                        <span className="flex min-w-0 items-center gap-2">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--app-hint)]">
                                {item.icon}
                            </span>
                            <span className="truncate text-sm font-medium text-[var(--app-fg)]">
                                {item.pending ? (item.pendingLabel ?? item.label) : item.label}
                            </span>
                        </span>
                        {item.pending ? <Spinner size="sm" label={null} className="text-[var(--app-hint)]" /> : null}
                    </Button>
                ))}
            </DisclosureCardSection>
        </div>
    )
}
