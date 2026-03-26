import type { JSX } from 'react'

type ActionButtonTone = 'primary' | 'secondary'

interface ActionButtonProps {
    label: string
    tone?: ActionButtonTone
    disabled?: boolean
    onClick: () => void
}

const ACTION_BUTTON_STYLES = {
    base: 'group relative px-4 py-2 rounded-md font-semibold text-sm transition-all duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]',
    disabled: 'disabled:opacity-40 disabled:cursor-not-allowed',
    primary: 'bg-accent-primary text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)] hover:bg-accent-primary/90 focus-visible:ring-accent-primary',
    secondary: 'bg-surface-item text-text-primary border border-border hover:border-[rgba(255,255,255,0.2)] focus-visible:ring-text-secondary active:bg-[rgba(255,255,255,0.02)]',
} as const

function getActionButtonClassName(tone: ActionButtonTone): string {
    return [
        ACTION_BUTTON_STYLES.base,
        ACTION_BUTTON_STYLES.disabled,
        ACTION_BUTTON_STYLES[tone]
    ].join(' ')
}

export function ActionButton({
    label,
    tone = 'secondary',
    disabled = false,
    onClick,
}: ActionButtonProps): JSX.Element {
    return (
        <button
            className={getActionButtonClassName(tone)}
            disabled={disabled}
            onClick={onClick}
            type="button"
        >
            {label}
        </button>
    )
}
