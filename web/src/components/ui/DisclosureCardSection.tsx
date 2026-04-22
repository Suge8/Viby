import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { ChevronIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { CollapsiblePanel } from '@/components/ui/CollapsiblePanel'
import { getInteractiveCardClassName } from '@/components/ui/interactiveCardStyles'
import { cn } from '@/lib/utils'

const DISCLOSURE_TRIGGER_CLASS_NAME =
    'min-h-0 gap-2 rounded-2xl border border-[color:color-mix(in_srgb,var(--ds-border-default)_86%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-panel)_95%,transparent)] px-2.5 py-1.5 shadow-none hover:border-[var(--ds-border-strong)]'

type DisclosureCardSectionProps = {
    triggerContent: ReactNode
    children?: ReactNode
    className?: string
    triggerClassName?: string
    chevronClassName?: string
    panelClassName?: string
    panelInnerClassName?: string
    ariaControls?: string
    ariaLabel?: string
    disabled?: boolean
    open?: boolean
    defaultOpen?: boolean
    onOpenChange?: (open: boolean) => void
}

function resolveNextOpen(open: boolean | undefined, defaultOpen: boolean | undefined): boolean {
    if (typeof open === 'boolean') {
        return open
    }

    return defaultOpen ?? false
}

export function DisclosureCardSection(props: DisclosureCardSectionProps): React.JSX.Element {
    const isControlled = typeof props.open === 'boolean'
    const [uncontrolledOpen, setUncontrolledOpen] = useState<boolean>(() =>
        resolveNextOpen(props.open, props.defaultOpen)
    )
    const open = isControlled ? props.open === true : uncontrolledOpen

    useEffect(() => {
        if (!props.disabled || isControlled || !uncontrolledOpen) {
            return
        }

        setUncontrolledOpen(false)
    }, [isControlled, props.disabled, uncontrolledOpen])

    const setOpen = useCallback(
        (nextOpen: boolean) => {
            if (!isControlled) {
                setUncontrolledOpen(nextOpen)
            }

            props.onOpenChange?.(nextOpen)
        },
        [isControlled, props.onOpenChange]
    )

    const handleToggle = useCallback(() => {
        if (props.disabled) {
            return
        }

        setOpen(!open)
    }, [open, props.disabled, setOpen])

    return (
        <section className={props.className}>
            <Button
                type="button"
                variant="plain"
                size="sm"
                disabled={props.disabled}
                className={cn(
                    getInteractiveCardClassName('disclosure-trigger'),
                    DISCLOSURE_TRIGGER_CLASS_NAME,
                    props.triggerClassName,
                    props.disabled ? 'cursor-not-allowed opacity-50' : ''
                )}
                aria-expanded={open}
                aria-controls={props.ariaControls}
                aria-label={props.ariaLabel}
                onClick={handleToggle}
                onMouseDown={(event) => event.preventDefault()}
            >
                {props.triggerContent}
                <ChevronIcon
                    collapsed={!open}
                    className={cn('h-3.5 w-3.5 shrink-0 text-[var(--app-hint)]', props.chevronClassName)}
                />
            </Button>

            {props.children ? (
                <CollapsiblePanel
                    open={open}
                    className={props.panelClassName}
                    innerClassName={props.panelInnerClassName}
                >
                    {props.children}
                </CollapsiblePanel>
            ) : null}
        </section>
    )
}

type DisclosureCardSummaryProps = {
    icon: ReactNode
    title: string
    summary?: string | null
    className?: string
}

export function DisclosureCardSummary(props: DisclosureCardSummaryProps): React.JSX.Element {
    return (
        <span className={cn('flex min-w-0 items-center gap-2', props.className)}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--ds-border-default)_82%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_92%,transparent)] text-[var(--app-fg)]">
                {props.icon}
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 text-xs leading-none font-medium text-[var(--app-hint)]">{props.title}</span>
                {props.summary ? (
                    <span className="truncate text-sm leading-none font-medium text-[var(--app-fg)]">
                        {props.summary}
                    </span>
                ) : null}
            </span>
        </span>
    )
}
