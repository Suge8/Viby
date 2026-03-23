import { memo } from 'react'

interface ActionButtonProps {
    label: string
    tone?: 'primary' | 'secondary'
    disabled?: boolean
    onClick: () => void
}

export const ActionButton = memo(function ActionButton({
    label,
    tone = 'secondary',
    disabled = false,
    onClick
}: ActionButtonProps) {
    const className = tone === 'primary'
        ? 'action-button action-button-primary'
        : 'action-button'

    return (
        <button className={className} disabled={disabled} onClick={onClick} type="button">
            {label}
        </button>
    )
})
