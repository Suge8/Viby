import { useEffect, useId, useRef, useState } from 'react'
import { DisclosureCardSection } from '@/components/ui/DisclosureCardSection'
import { PressableSurface, PressableSurfaceSelectionIndicator } from '@/components/ui/pressable-surface'
import { cn } from '@/lib/utils'

export type NewSessionChoiceOption<T extends string> = {
    value: T
    label: string
    description?: string
    meta?: string
}

export function NewSessionChoiceField<T extends string>(props: {
    ariaLabel: string
    value: T | null
    options: ReadonlyArray<NewSessionChoiceOption<T>>
    disabled?: boolean
    className?: string
    triggerClassName?: string
    onChange: (value: T) => void
}) {
    const [open, setOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const panelId = useId()

    useEffect(() => {
        if (!open) {
            return
        }

        function handlePointerDown(event: MouseEvent): void {
            if (containerRef.current?.contains(event.target as Node)) {
                return
            }

            setOpen(false)
        }

        function handleEscape(event: KeyboardEvent): void {
            if (event.key === 'Escape') {
                setOpen(false)
            }
        }

        document.addEventListener('mousedown', handlePointerDown)
        document.addEventListener('keydown', handleEscape)

        return () => {
            document.removeEventListener('mousedown', handlePointerDown)
            document.removeEventListener('keydown', handleEscape)
        }
    }, [open])

    useEffect(() => {
        if (props.disabled) {
            setOpen(false)
        }
    }, [props.disabled])

    if (props.options.length === 0) {
        return null
    }

    const selectedOption = props.options.find((option) => option.value === props.value) ?? props.options[0] ?? null

    return (
        <div ref={containerRef} className={cn('space-y-2', props.className)}>
            <DisclosureCardSection
                disabled={props.disabled}
                open={open}
                onOpenChange={setOpen}
                ariaControls={panelId}
                ariaLabel={props.ariaLabel}
                triggerClassName={cn(
                    'rounded-2xl border-[var(--ds-border-default)] px-4 py-3 shadow-none',
                    props.triggerClassName
                )}
                panelClassName="pt-0.5"
                triggerContent={
                    <span className="flex min-w-0 flex-1 items-start gap-3">
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-[var(--ds-text-primary)]">
                                {selectedOption?.label ?? ''}
                            </span>
                            {selectedOption?.description ? (
                                <span className="mt-1 block text-xs leading-5 text-[var(--ds-text-secondary)]">
                                    {selectedOption.description}
                                </span>
                            ) : null}
                        </span>

                        {selectedOption?.meta ? (
                            <span className="rounded-full border border-[var(--ds-border-default)] bg-[var(--app-subtle-bg)] px-2.5 py-1 text-xs font-medium text-[var(--ds-text-secondary)]">
                                {selectedOption.meta}
                            </span>
                        ) : null}
                    </span>
                }
            >
                <div
                    id={panelId}
                    role="listbox"
                    aria-label={props.ariaLabel}
                    className="grid gap-2 rounded-2xl border border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_94%,transparent)] p-2.5"
                >
                    {props.options.map((option) => {
                        const isSelected = option.value === props.value

                        return (
                            <PressableSurface
                                key={option.value}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                selected={isSelected}
                                density="compact"
                                disabled={props.disabled}
                                className="items-start gap-3 rounded-2xl"
                                onClick={() => {
                                    props.onChange(option.value)
                                    setOpen(false)
                                }}
                            >
                                <span className="min-w-0 flex-1 text-left">
                                    <span className="block truncate text-sm font-semibold text-[var(--ds-text-primary)]">
                                        {option.label}
                                    </span>
                                    {option.description ? (
                                        <span className="mt-1 block text-xs leading-5 text-[var(--ds-text-secondary)]">
                                            {option.description}
                                        </span>
                                    ) : null}
                                </span>

                                {option.meta ? (
                                    <span className="rounded-full border border-[var(--ds-border-default)] bg-[var(--app-subtle-bg)] px-2.5 py-1 text-xs font-medium text-[var(--ds-text-secondary)]">
                                        {option.meta}
                                    </span>
                                ) : null}

                                <PressableSurfaceSelectionIndicator selected={isSelected} className="mt-0.5" />
                            </PressableSurface>
                        )
                    })}
                </div>
            </DisclosureCardSection>
        </div>
    )
}
