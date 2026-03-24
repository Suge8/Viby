interface ActionButtonProps {
    label: string
    tone?: 'primary' | 'secondary'
    disabled?: boolean
    onClick: () => void
}

const buttonStyles = {
    base: 'px-4 py-2 rounded-md font-semibold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900',
    disabled: 'disabled:opacity-50 disabled:cursor-not-allowed',
    primary: 'bg-sky-600 text-white hover:bg-sky-500 focus:ring-sky-500',
    secondary: 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 focus:ring-slate-500',
}

export function ActionButton({
    label,
    tone = 'secondary',
    disabled = false,
    onClick
}: ActionButtonProps) {
    const className = `${buttonStyles.base} ${buttonStyles.disabled} ${
        tone === 'primary' ? buttonStyles.primary : buttonStyles.secondary
    }`

    return (
        <button
            className={className}
            disabled={disabled}
            onClick={onClick}
            type="button"
        >
            {label}
        </button>
    )
}
