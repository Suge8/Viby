import type { JSX } from 'react'

interface MetricCardProps {
    label: string
    value: string
    actionLabel?: string
    onAction?: () => void
    mono?: boolean
}

export function MetricCard({ label, value, actionLabel, onAction, mono = false }: MetricCardProps): JSX.Element {
    return (
        <article className="desktop-metric-card">
            <div className="desktop-metric-head">
                <span>{label}</span>
                {actionLabel && onAction ? (
                    <button className="desktop-metric-action" onClick={onAction} type="button">
                        {actionLabel}
                    </button>
                ) : null}
            </div>
            <p className={`desktop-metric-value ${mono ? 'is-mono' : ''}`}>{value}</p>
        </article>
    )
}
