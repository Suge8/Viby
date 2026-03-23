import { memo, useCallback, type PointerEvent, type ReactNode } from 'react'
import { useLongPress } from '@/hooks/useLongPress'
import { Button } from '@/components/ui/button'

export type QuickInput = {
    label: string
    sequence?: string
    description: string
    modifier?: 'ctrl' | 'alt'
    popup?: {
        label: string
        sequence: string
        description: string
    }
}

export type ModifierState = Readonly<{
    ctrl: boolean
    alt: boolean
}>

export function applyModifierState(sequence: string, state: ModifierState): string {
    let modified = sequence

    if (state.alt) {
        modified = `\u001b${modified}`
    }

    if (state.ctrl && modified.length === 1) {
        const code = modified.toUpperCase().charCodeAt(0)
        if (code >= 64 && code <= 95) {
            modified = String.fromCharCode(code - 64)
        }
    }

    return modified
}

export function shouldResetModifiers(sequence: string, state: ModifierState): boolean {
    if (!sequence) {
        return false
    }

    return state.ctrl || state.alt
}

export const QUICK_INPUT_ROWS: QuickInput[][] = [
    [
        { label: 'Esc', sequence: '\u001b', description: 'Escape' },
        {
            label: '/',
            sequence: '/',
            description: 'Forward slash',
            popup: { label: '?', sequence: '?', description: 'Question mark' },
        },
        {
            label: '-',
            sequence: '-',
            description: 'Hyphen',
            popup: { label: '|', sequence: '|', description: 'Pipe' },
        },
        { label: 'Home', sequence: '\u001b[H', description: 'Home' },
        { label: '↑', sequence: '\u001b[A', description: 'Arrow up' },
        { label: 'End', sequence: '\u001b[F', description: 'End' },
        { label: 'PgUp', sequence: '\u001b[5~', description: 'Page up' },
    ],
    [
        { label: 'Tab', sequence: '\t', description: 'Tab' },
        { label: 'Ctrl', description: 'Control', modifier: 'ctrl' },
        { label: 'Alt', description: 'Alternate', modifier: 'alt' },
        { label: '←', sequence: '\u001b[D', description: 'Arrow left' },
        { label: '↓', sequence: '\u001b[B', description: 'Arrow down' },
        { label: '→', sequence: '\u001b[C', description: 'Arrow right' },
        { label: 'PgDn', sequence: '\u001b[6~', description: 'Page down' },
    ],
]

type ConnectionIndicatorProps = {
    status: 'idle' | 'connecting' | 'connected' | 'error'
    statusLabel: string
}

function getConnectionIndicatorClassName(status: ConnectionIndicatorProps['status']): string {
    if (status === 'connected') {
        return 'bg-emerald-500'
    }

    if (status === 'connecting') {
        return 'animate-pulse bg-amber-400'
    }

    return 'bg-[var(--app-hint)]'
}

export function ConnectionIndicator(props: ConnectionIndicatorProps): ReactNode {
    return (
        <div className="flex items-center" aria-label={props.statusLabel} title={props.statusLabel} role="status">
            <span className={`h-2.5 w-2.5 rounded-full ${getConnectionIndicatorClassName(props.status)}`} />
        </div>
    )
}

type QuickKeyButtonProps = {
    input: QuickInput
    disabled: boolean
    isActive: boolean
    onPress: (sequence: string) => void
    onToggleModifier: (modifier: 'ctrl' | 'alt') => void
}

const QuickKeyButton = memo(function QuickKeyButton(props: QuickKeyButtonProps): ReactNode {
    const { disabled, input, isActive, onPress, onToggleModifier } = props
    const modifier = input.modifier
    const popupSequence = input.popup?.sequence
    const popupDescription = input.popup?.description
    const longPressDisabled = disabled || Boolean(modifier) || !popupSequence

    const handleClick = useCallback(() => {
        if (modifier) {
            onToggleModifier(modifier)
            return
        }

        onPress(input.sequence ?? '')
    }, [input.sequence, modifier, onPress, onToggleModifier])

    const longPressHandlers = useLongPress({
        onLongPress: () => {
            if (popupSequence && !modifier) {
                onPress(popupSequence)
            }
        },
        onClick: handleClick,
        disabled: longPressDisabled,
    })

    const handleButtonPointerDown = useCallback((event: PointerEvent<HTMLButtonElement>) => {
        longPressHandlers.onPointerDown(event)

        if (event.pointerType === 'touch') {
            event.preventDefault()
        }
    }, [longPressHandlers])

    return (
        <Button
            {...longPressHandlers}
            variant="plain"
            onPointerDown={handleButtonPointerDown}
            disabled={disabled}
            aria-pressed={modifier ? isActive : undefined}
            className={`flex-1 rounded-none border-l border-[var(--app-border)] px-2 py-1.5 text-xs font-medium text-[var(--app-fg)] shadow-none focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent first:border-l-0 [&>[data-button-content]]:w-full [&>[data-button-content]]:justify-center sm:px-3 sm:text-sm ${
                isActive ? 'bg-[var(--app-link)] text-[var(--app-bg)]' : 'hover:bg-[var(--app-subtle-bg)]'
            }`}
            aria-label={input.description}
            title={popupDescription ? `${input.description} (long press: ${popupDescription})` : input.description}
        >
            {input.label}
        </Button>
    )
})

type TerminalQuickInputBarProps = {
    altActive: boolean
    ctrlActive: boolean
    disabled: boolean
    onPaste: () => void
    onPress: (sequence: string) => void
    onToggleModifier: (modifier: 'ctrl' | 'alt') => void
    pasteLabel: string
}

export function TerminalQuickInputBar(props: TerminalQuickInputBarProps): ReactNode {
    return (
        <div className="bg-[var(--app-bg)] border-t border-[var(--app-border)] pb-[env(safe-area-inset-bottom)]">
            <div className="mx-auto w-full ds-stage-shell px-3">
                <div className="flex flex-col gap-2 py-2">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={props.onPaste}
                        disabled={props.disabled}
                        className="w-full text-sm"
                    >
                        {props.pasteLabel}
                    </Button>

                    {QUICK_INPUT_ROWS.map((row, rowIndex) => (
                        <div
                            key={`terminal-quick-row-${rowIndex}`}
                            className="flex items-stretch overflow-hidden rounded-md bg-[var(--app-secondary-bg)]"
                        >
                            {row.map((input) => {
                                const isCtrl = input.modifier === 'ctrl'
                                const isAlt = input.modifier === 'alt'
                                const isActive = (isCtrl && props.ctrlActive) || (isAlt && props.altActive)

                                return (
                                    <QuickKeyButton
                                        key={input.label}
                                        input={input}
                                        disabled={props.disabled}
                                        isActive={isActive}
                                        onPress={props.onPress}
                                        onToggleModifier={props.onToggleModifier}
                                    />
                                )
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
