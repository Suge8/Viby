import { memo } from 'react'

interface InfoFieldProps {
    label: string
    value?: string
    actionLabel?: string
    onAction?: () => void
    mono?: boolean
}

export const InfoField = memo(function InfoField({
    label,
    value,
    actionLabel,
    onAction,
    mono = false
}: InfoFieldProps) {
    return (
        <div className="info-field">
            <div className="info-field-header">
                <span className="info-field-label">{label}</span>
                {actionLabel && onAction ? (
                    <button className="link-button" onClick={onAction} type="button">
                        {actionLabel}
                    </button>
                ) : null}
            </div>
            <div className={mono ? 'info-field-value mono-text' : 'info-field-value'}>
                {value || '暂无'}
            </div>
        </div>
    )
})
