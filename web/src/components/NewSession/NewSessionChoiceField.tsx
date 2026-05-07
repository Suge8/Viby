import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from 'react'
import { DisclosureCardSection } from '@/components/ui/DisclosureCardSection'
import { PressableSurface, PressableSurfaceSelectionIndicator } from '@/components/ui/pressable-surface'
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
    className?: string
    triggerClassName?: string
    onChange: (value: T) => void
}

type OutsidePointerStart = {
    pointerId: number
    clientX: number
    clientY: number
}

const OUTSIDE_TAP_MAX_DISTANCE_PX = 8
const CHOICE_BUTTON_SELECTOR = 'button:not(:disabled)'

function didPointerDrag(start: OutsidePointerStart, event: PointerEvent): boolean {
    return Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) > OUTSIDE_TAP_MAX_DISTANCE_PX
}

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
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(CHOICE_BUTTON_SELECTOR))
    const eventTarget = event.target as Node
    const activeIndex = buttons.findIndex((button) => button === eventTarget || button.contains(eventTarget))
    const nextIndex = activeIndex >= 0 ? getNextChoiceIndex(event.key, activeIndex, buttons.length - 1) : null
    const nextButton = nextIndex === null ? null : buttons[nextIndex]

    if (!nextButton) return
    event.preventDefault()
    nextButton.focus()
}

function useChoiceFieldDismiss(
    open: boolean,
    containerRef: RefObject<HTMLDivElement | null>,
    setOpen: (open: boolean) => void
): void {
    const outsidePointerStartRef = useRef<OutsidePointerStart | null>(null)

    useEffect(() => {
        if (!open) return

        function handlePointerDown(event: PointerEvent): void {
            outsidePointerStartRef.current = containerRef.current?.contains(event.target as Node)
                ? null
                : { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY }
        }

        function handlePointerUp(event: PointerEvent): void {
            const start = outsidePointerStartRef.current
            outsidePointerStartRef.current = null
            if (!start || start.pointerId !== event.pointerId || didPointerDrag(start, event)) return
            if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
        }

        function handlePointerCancel(): void {
            outsidePointerStartRef.current = null
        }

        function handleEscape(event: KeyboardEvent): void {
            if (event.key === 'Escape') setOpen(false)
        }

        document.addEventListener('pointerdown', handlePointerDown)
        document.addEventListener('pointerup', handlePointerUp)
        document.addEventListener('pointercancel', handlePointerCancel)
        document.addEventListener('keydown', handleEscape)

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown)
            document.removeEventListener('pointerup', handlePointerUp)
            document.removeEventListener('pointercancel', handlePointerCancel)
            document.removeEventListener('keydown', handleEscape)
            outsidePointerStartRef.current = null
        }
    }, [containerRef, open, setOpen])
}

function ChoiceTriggerContent<T extends string>(props: {
    option: NewSessionChoiceOption<T> | null
    placeholder?: string
}): React.JSX.Element {
    return (
        <span className="flex min-w-0 flex-1 items-start gap-3">
            {props.option?.icon ? <span className="shrink-0 pt-0.5">{props.option.icon}</span> : null}
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[var(--ds-text-primary)]">
                    {props.option?.label ?? props.placeholder ?? ''}
                </span>
                {props.option?.description ? (
                    <span className="mt-1 block text-xs leading-5 text-[var(--ds-text-secondary)]">
                        {props.option.description}
                    </span>
                ) : null}
            </span>

            {props.option?.meta ? (
                <span className="shrink-0 rounded-full border border-[var(--ds-border-default)] bg-[var(--app-subtle-bg)] px-2.5 py-1 text-xs font-medium text-[var(--ds-text-secondary)]">
                    {props.option.meta}
                </span>
            ) : null}
        </span>
    )
}

function ChoiceOptionButton<T extends string>(props: {
    option: NewSessionChoiceOption<T>
    selected: boolean
    disabled?: boolean
    onSelect: () => void
}): React.JSX.Element {
    return (
        <PressableSurface
            type="button"
            aria-pressed={props.selected}
            selected={props.selected}
            density="compact"
            disabled={props.disabled}
            className="items-start gap-3 rounded-2xl"
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

            {props.option.meta ? (
                <span className="shrink-0 rounded-full border border-[var(--ds-border-default)] bg-[var(--app-subtle-bg)] px-2.5 py-1 text-xs font-medium text-[var(--ds-text-secondary)]">
                    {props.option.meta}
                </span>
            ) : null}

            <PressableSurfaceSelectionIndicator selected={props.selected} className="mt-0.5" />
        </PressableSurface>
    )
}

function ChoiceOptionsList<T extends string>(props: {
    id: string
    ariaLabel: string
    value: T | null
    options: ReadonlyArray<NewSessionChoiceOption<T>>
    disabled?: boolean
    onSelect: (value: T) => void
}): React.JSX.Element {
    return (
        <div
            id={props.id}
            role="group"
            aria-label={props.ariaLabel}
            className="ds-new-session-choice-options desktop-scrollbar-stable grid gap-2 overflow-y-auto overscroll-contain rounded-2xl border border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_94%,transparent)] p-2.5"
            onKeyDown={handleChoiceListKeyDown}
        >
            {props.options.map((option) => (
                <ChoiceOptionButton
                    key={option.value}
                    option={option}
                    selected={option.value === props.value}
                    disabled={props.disabled}
                    onSelect={() => props.onSelect(option.value)}
                />
            ))}
        </div>
    )
}

export function NewSessionChoiceField<T extends string>(
    props: NewSessionChoiceFieldProps<T>
): React.JSX.Element | null {
    const [open, setOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const panelId = useId()
    useChoiceFieldDismiss(open, containerRef, setOpen)

    useEffect(() => {
        if (props.disabled) setOpen(false)
    }, [props.disabled])

    if (props.options.length === 0) return null

    const selectedOption = props.value ? (props.options.find((option) => option.value === props.value) ?? null) : null

    function handleSelect(value: T): void {
        props.onChange(value)
        setOpen(false)
    }

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
                triggerContent={<ChoiceTriggerContent option={selectedOption} placeholder={props.placeholder} />}
            >
                <ChoiceOptionsList
                    id={panelId}
                    ariaLabel={props.ariaLabel}
                    value={props.value}
                    options={props.options}
                    disabled={props.disabled}
                    onSelect={handleSelect}
                />
            </DisclosureCardSection>
        </div>
    )
}
