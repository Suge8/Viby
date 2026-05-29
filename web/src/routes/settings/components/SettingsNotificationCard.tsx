import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

type SettingsNotificationCardProps = {
    title: string
    description: string
    isChecked: boolean
    isDisabled: boolean
    isPending: boolean
    onToggle: (nextEnabled: boolean) => void
    refresh?: {
        label: string
        onClick: () => void
    }
}

export function SettingsNotificationCard(props: SettingsNotificationCardProps): React.JSX.Element {
    return (
        <section className="relative">
            <label className="flex items-start justify-between gap-4 px-4 py-4 sm:px-5">
                <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-[var(--ds-text-primary)]">{props.title}</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--ds-text-secondary)]">{props.description}</p>
                </div>
                <Switch
                    checked={props.isChecked}
                    disabled={props.isDisabled || props.isPending}
                    onChange={(event) => props.onToggle(event.currentTarget.checked)}
                    aria-label={props.title}
                    className="mt-1"
                />
            </label>
            {props.refresh ? (
                <div className="border-t border-[var(--ds-border-subtle)] px-4 py-3 sm:px-5">
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={props.refresh.onClick}
                        disabled={props.isPending}
                        pending={props.isPending}
                    >
                        {props.refresh.label}
                    </Button>
                </div>
            ) : null}
        </section>
    )
}
