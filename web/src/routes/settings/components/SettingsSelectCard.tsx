import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CheckIcon, ChevronIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const SETTINGS_CARD_TRANSITION = {
    duration: 0.24,
    ease: [0.22, 1, 0.36, 1] as const,
}

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
    const shouldReduceMotion = useReducedMotion()
    const panelTransition = shouldReduceMotion ? { duration: 0 } : SETTINGS_CARD_TRANSITION

    return (
        <motion.section
            layout
            transition={panelTransition}
            className="relative mx-3 my-3 overflow-hidden rounded-[20px] border border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_96%,transparent)] shadow-[var(--ds-shadow-soft)] sm:mx-4"
        >
            <Button
                type="button"
                variant="ghost"
                onClick={props.disclosure.onToggle}
                aria-expanded={props.disclosure.isOpen}
                className="min-h-[64px] w-full justify-start gap-4 border-transparent bg-transparent px-4 py-4 text-left shadow-none sm:px-5 [&>[data-button-content]]:w-full [&>[data-button-content]]:justify-between"
            >
                <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-[var(--ds-text-primary)]">
                        {props.summary.title}
                    </p>
                </div>

                <div className="flex items-center gap-2.5">
                    <span className="rounded-full border border-[var(--ds-border-default)] bg-[color-mix(in_srgb,var(--ds-brand-soft)_70%,var(--ds-panel-strong))] px-3 py-1 text-sm font-medium text-[var(--ds-text-secondary)]">
                        {props.summary.valueLabel}
                    </span>
                    <ChevronIcon
                        collapsed={!props.disclosure.isOpen}
                        className="h-5 w-5 text-[var(--ds-text-muted)]"
                    />
                </div>
            </Button>

            <AnimatePresence initial={false}>
                {props.disclosure.isOpen ? (
                    <motion.div
                        key="options"
                        initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                        animate={shouldReduceMotion ? { height: 'auto', opacity: 1 } : { height: 'auto', opacity: 1 }}
                        exit={shouldReduceMotion ? { height: 0, opacity: 0 } : { height: 0, opacity: 0 }}
                        transition={panelTransition}
                        className="overflow-hidden"
                    >
                        <div className="border-t border-[var(--ds-border-subtle)] px-4 py-3 sm:px-5">
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
                                                'ds-setting-option',
                                                'rounded-[18px] px-3.5 py-3',
                                                '[&>[data-button-content]]:w-full [&>[data-button-content]]:justify-between',
                                                isSelected && 'border-[var(--ds-border-strong)] bg-[var(--app-subtle-bg)] text-[var(--ds-text-primary)] shadow-[var(--ds-shadow-soft)]'
                                            )}
                                        >
                                            <span className="text-sm font-semibold">
                                                {option.label}
                                            </span>
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
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </motion.section>
    )
}
