import type { ButtonProps } from '@/components/ui/button'
import { Button } from '@/components/ui/button'

export type SettingsActionCardAction = {
    label: string
    onClick: () => void
    disabled?: boolean
    variant?: ButtonProps['variant']
}

type SettingsActionCardProps = {
    summary: {
        title: string
        description: string
        valueLabel: string
        detail?: string
    }
    actions?: ReadonlyArray<SettingsActionCardAction>
}

export function SettingsActionCard(props: SettingsActionCardProps): React.JSX.Element {
    return (
        <section className="relative mx-3 my-3 overflow-hidden rounded-[var(--ds-radius-lg)] border border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_96%,transparent)] shadow-[var(--ds-shadow-soft)] sm:mx-4">
            <div className="flex items-start justify-between gap-4 px-4 py-4 sm:px-5">
                <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-[var(--ds-text-primary)]">{props.summary.title}</p>
                    <p className="mt-1.5 text-sm leading-6 text-[var(--ds-text-secondary)]">
                        {props.summary.description}
                    </p>
                    {props.summary.detail ? (
                        <p className="mt-2 text-xs leading-5 text-[var(--ds-text-muted)]">{props.summary.detail}</p>
                    ) : null}
                </div>

                <span className="shrink-0 rounded-full border border-[var(--ds-border-default)] bg-[color-mix(in_srgb,var(--ds-brand-soft)_70%,var(--ds-panel-strong))] px-3 py-1 text-sm font-medium text-[var(--ds-text-secondary)]">
                    {props.summary.valueLabel}
                </span>
            </div>

            {props.actions && props.actions.length > 0 ? (
                <div className="border-t border-[var(--ds-border-subtle)] px-4 py-3 sm:px-5">
                    <div className="flex flex-wrap gap-2.5">
                        {props.actions.map((action) => (
                            <Button
                                key={action.label}
                                type="button"
                                size="sm"
                                variant={action.variant ?? 'secondary'}
                                onClick={action.onClick}
                                disabled={action.disabled}
                            >
                                {action.label}
                            </Button>
                        ))}
                    </div>
                </div>
            ) : null}
        </section>
    )
}
