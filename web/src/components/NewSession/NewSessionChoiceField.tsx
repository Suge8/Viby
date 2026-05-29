import { type ReactNode, useState } from 'react'
import { Spinner } from '@/components/Spinner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { PressableSurface, PressableSurfaceSelectionIndicator } from '@/components/ui/pressable-surface'
import { useTranslation } from '@/lib/use-translation'
import { cn } from '@/lib/utils'

export type NewSessionChoiceOption<T extends string> = {
    value: T
    label: string
    description?: string
    meta?: string
    icon?: ReactNode
}

type NewSessionChoiceFieldProps<T extends string> = {
    ariaLabel: string
    value: T | null
    options: ReadonlyArray<NewSessionChoiceOption<T>>
    placeholder?: string
    disabled?: boolean
    isLoading?: boolean
    className?: string
    triggerClassName?: string
    triggerIcon?: ReactNode
    onChange: (value: T) => void
}

const CHOICE_OPTION_BUTTON_SELECTOR = 'button:not(:disabled)'

function getNextChoiceIndex(key: string, currentIndex: number, lastIndex: number): number | null {
    switch (key) {
        case 'ArrowRight':
        case 'ArrowDown':
            return currentIndex === lastIndex ? 0 : currentIndex + 1
        case 'ArrowLeft':
        case 'ArrowUp':
            return currentIndex === 0 ? lastIndex : currentIndex - 1
        case 'Home':
            return 0
        case 'End':
            return lastIndex
        default:
            return null
    }
}

function handleChoiceListKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(CHOICE_OPTION_BUTTON_SELECTOR))
    const eventTarget = event.target as Node
    const activeIndex = buttons.findIndex((button) => button === eventTarget || button.contains(eventTarget))
    const nextIndex = activeIndex >= 0 ? getNextChoiceIndex(event.key, activeIndex, buttons.length - 1) : null
    const nextButton = nextIndex === null ? null : buttons[nextIndex]

    if (!nextButton) return
    event.preventDefault()
    nextButton.focus()
}

type ChoiceTriggerProps<T extends string> = {
    option: NewSessionChoiceOption<T> | null
    placeholder?: string
    ariaLabel: string
    disabled?: boolean
    isLoading?: boolean
    triggerClassName?: string
    triggerIcon?: ReactNode
    onClick: () => void
}

function ChoiceTrigger<T extends string>(props: ChoiceTriggerProps<T>): React.JSX.Element {
    const { t } = useTranslation()
    const baseLabel = props.option?.meta ?? props.option?.label ?? props.placeholder ?? ''
    const showSpinner = props.isLoading === true
    const displayLabel = showSpinner ? t('loading') : baseLabel
    const leadingIcon = showSpinner ? (
        <Spinner size="sm" label={null} className="h-4 w-4 text-[var(--ds-brand)]" />
    ) : (
        (props.triggerIcon ?? props.option?.icon ?? null)
    )
    return (
        <Button
            type="button"
            variant="plain"
            pressStyle="card"
            size="none"
            disabled={props.disabled}
            onClick={props.onClick}
            aria-haspopup="dialog"
            aria-label={props.ariaLabel}
            aria-busy={showSpinner || undefined}
            className={cn('ds-new-session-choice-trigger', props.triggerClassName)}
        >
            <span className="ds-new-session-choice-trigger-content">
                {leadingIcon ? <span className="ds-new-session-choice-trigger-icon">{leadingIcon}</span> : null}
                <span className="ds-new-session-choice-trigger-label">{displayLabel}</span>
            </span>
        </Button>
    )
}

type ChoiceOptionButtonProps<T extends string> = {
    option: NewSessionChoiceOption<T>
    selected: boolean
    disabled?: boolean
    onSelect: () => void
}

function ChoiceOptionButton<T extends string>(props: ChoiceOptionButtonProps<T>): React.JSX.Element {
    return (
        <PressableSurface
            type="button"
            aria-pressed={props.selected}
            selected={props.selected}
            density="compact"
            disabled={props.disabled}
            className="ds-new-session-choice-option items-start gap-3 rounded-2xl"
            onClick={props.onSelect}
        >
            {props.option.icon ? <span className="shrink-0 pt-0.5">{props.option.icon}</span> : null}
            <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-semibold text-[var(--ds-text-primary)]">
                    {props.option.label}
                </span>
                {props.option.description ? (
                    <span className="mt-1 block text-xs leading-5 text-[var(--ds-text-secondary)]">
                        {props.option.description}
                    </span>
                ) : null}
            </span>

            {props.option.meta ? <span className="ds-new-session-choice-option-meta">{props.option.meta}</span> : null}

            <PressableSurfaceSelectionIndicator selected={props.selected} className="mt-0.5" />
        </PressableSurface>
    )
}

export function NewSessionChoiceField<T extends string>(
    props: NewSessionChoiceFieldProps<T>
): React.JSX.Element | null {
    const [open, setOpen] = useState(false)

    if (props.options.length === 0) return null

    const selectedOption = props.value ? (props.options.find((option) => option.value === props.value) ?? null) : null

    function handleSelect(value: T): void {
        props.onChange(value)
        setOpen(false)
    }

    return (
        <div className={props.className}>
            <ChoiceTrigger
                option={selectedOption}
                placeholder={props.placeholder}
                ariaLabel={props.ariaLabel}
                disabled={props.disabled}
                isLoading={props.isLoading}
                triggerClassName={props.triggerClassName}
                triggerIcon={props.triggerIcon}
                onClick={() => setOpen(true)}
            />
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="ds-new-session-choice-dialog" aria-describedby={undefined}>
                    <DialogTitle className="ds-new-session-choice-dialog-title">
                        {props.triggerIcon ? (
                            <span className="ds-new-session-choice-dialog-title-icon">{props.triggerIcon}</span>
                        ) : null}
                        <span>{props.ariaLabel}</span>
                    </DialogTitle>
                    <div
                        role="group"
                        aria-label={props.ariaLabel}
                        className="ds-new-session-choice-options desktop-scrollbar-stable"
                        onKeyDown={handleChoiceListKeyDown}
                    >
                        {props.options.map((option) => (
                            <ChoiceOptionButton
                                key={option.value}
                                option={option}
                                selected={option.value === props.value}
                                disabled={props.disabled}
                                onSelect={() => handleSelect(option.value)}
                            />
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
