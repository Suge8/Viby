const INFO_FIELD_CARD_CLASS_NAME =
    'bg-surface-item border border-border rounded-md p-4 transition-all duration-200 hover:border-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.01)]'
const INFO_FIELD_ACTION_CLASS_NAME =
    'text-sm font-medium text-accent-primary transition-colors hover:underline'

interface InfoFieldProps {
    label: string
    value?: string
    actionLabel?: string
    onAction?: () => void
    mono?: boolean
}

export function InfoField({
    label,
    value,
    actionLabel,
    onAction,
    mono = false,
}: InfoFieldProps) {
    const valueClassName = [
        'mt-2 text-lg font-semibold text-text-primary',
        mono ? 'font-mono' : ''
    ].join(' ').trim()

    return (
        <div className={INFO_FIELD_CARD_CLASS_NAME}>
            <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary font-medium">{label}</span>
                {actionLabel && onAction ? (
                    <button
                        className={INFO_FIELD_ACTION_CLASS_NAME}
                        onClick={onAction}
                        type="button"
                    >
                        {actionLabel}
                    </button>
                ) : null}
            </div>
            <div className={valueClassName}>
                {value || <span className="text-text-secondary/70">暂无</span>}
            </div>
        </div>
    )
}
