import type { JSX } from 'react'

interface ControlPillProps {
    label: string
    onClick: () => void
    disabled?: boolean
}

export function ControlPill({ label, onClick, disabled = false }: ControlPillProps): JSX.Element {
    return (
        <button className="desktop-control-pill" disabled={disabled} onClick={onClick} type="button">
            {label}
        </button>
    )
}
