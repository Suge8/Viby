import { FeatureCheckIcon as CheckIcon } from '@/components/featureIcons'
import { ChevronIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { CollapsiblePanel } from '@/components/ui/CollapsiblePanel'
import { cn } from '@/lib/utils'

const SETTINGS_SELECT_CARD_CLASS_NAME =
    'ds-settings-select-card rounded-[var(--ds-radius-lg)] border border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_96%,transparent)] shadow-[var(--ds-shadow-soft)]'
const SETTINGS_SELECT_OPTION_CLASS_NAME =
    'ds-setting-option ds-settings-select-option rounded-[calc(var(--ds-radius-md)+2px)] px-3.5 py-3'

export type SettingsSelectOption<T extends string | number> = {
    value: T
    label: string
}

type SettingsSelectCardProps<T extends string | number> = {
    summary: {
        title: string
        valueLabel: string
    }
    disclosure: {
        isOpen: boolean
        onToggle: () => void
    }
    selection: {
        options: ReadonlyArray<SettingsSelectOption<T>>
        selectedValue: T
        onSelect: (value: T) => void
    }
}

export function SettingsSelectCard<T extends string | number>(props: SettingsSelectCardProps<T>) {
    return (
        <section className={cn('relative mx-3 my-3 overflow-hidden sm:mx-4', SETTINGS_SELECT_CARD_CLASS_NAME)}>
            <Button
                type="button"
                variant="ghost"
                onClick={props.disclosure.onToggle}
                aria-expanded={props.disclosure.isOpen}
                className="ds-settings-select-summary w-full justify-start gap-4 border-transparent bg-transparent px-4 py-4 text-left shadow-none sm:px-5 [&>[data-button-content]]:w-full [&>[data-button-content]]:justify-between"
            >
                <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-[var(--ds-text-primary)]">{props.summary.title}</p>
                </div>

                <div className="flex items-center gap-2.5">
                    <span className="rounded-full border border-[var(--ds-border-default)] bg-[color-mix(in_srgb,var(--ds-brand-soft)_70%,var(--ds-panel-strong))] px-3 py-1 text-sm font-medium text-[var(--ds-text-secondary)]">
                        {props.summary.valueLabel}
                    </span>
                    <ChevronIcon collapsed={!props.disclosure.isOpen} className="h-5 w-5 text-[var(--ds-text-muted)]" />
                </div>
            </Button>

            <CollapsiblePanel open={props.disclosure.isOpen} className="border-t border-[var(--ds-border-subtle)]">
                <div className="px-4 py-3 sm:px-5">
                    <div className="grid gap-2">
                        {props.selection.options.map((option) => {
                            const isSelected = option.value === props.selection.selectedValue

                            return (
                                <Button
                                    key={String(option.value)}
                                    type="button"
                                    size="sm"
                                    variant={isSelected ? 'secondary' : 'ghost'}
                                    onClick={() => props.selection.onSelect(option.value)}
                                    aria-pressed={isSelected}
                                    className={cn(
                                        SETTINGS_SELECT_OPTION_CLASS_NAME,
                                        '[&>[data-button-content]]:w-full [&>[data-button-content]]:justify-between',
                                        isSelected &&
                                            'border-[var(--ds-border-strong)] bg-[var(--app-subtle-bg)] text-[var(--ds-text-primary)] shadow-[var(--ds-shadow-soft)]'
                                    )}
                                >
                                    <span className="text-sm font-semibold">{option.label}</span>
                                    <span
                                        className={cn(
                                            'flex h-7 w-7 items-center justify-center rounded-full border',
                                            isSelected
                                                ? 'border-[var(--ds-brand)] bg-[var(--ds-brand)] text-[var(--ds-text-inverse)]'
                                                : 'border-[var(--ds-border-default)] bg-[var(--ds-panel-strong)] text-[var(--ds-text-muted)]'
                                        )}
                                    >
                                        <CheckIcon className="h-4 w-4" />
                                    </span>
                                </Button>
                            )
                        })}
                    </div>
                </div>
            </CollapsiblePanel>
        </section>
    )
}
