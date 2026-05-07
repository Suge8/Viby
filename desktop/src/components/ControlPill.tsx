import type { JSX, ReactNode } from 'react'

interface ControlPillProps {
    label: string
    onClick: () => void
    disabled?: boolean
    icon?: ReactNode
}

export function ControlPill({ label, onClick, disabled = false, icon }: ControlPillProps): JSX.Element {
    return (
        <button className="desktop-control-pill" disabled={disabled} onClick={onClick} type="button">
            {icon ? (
                <span className="desktop-control-pill-icon" aria-hidden="true">
                    {icon}
                </span>
            ) : null}
            <span>{label}</span>
        </button>
    )
}
