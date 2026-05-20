import type { JSX } from 'react'

export function DesktopToggle(props: {
    checked: boolean
    disabled?: boolean
    labelId?: string
    onClick(): void
}): JSX.Element {
    return (
        <button
            type="button"
            className={`desktop-toggle ${props.checked ? 'is-on' : ''}`}
            role="switch"
            aria-checked={props.checked}
            aria-labelledby={props.labelId}
            disabled={props.disabled}
            onClick={props.onClick}
        >
            <span />
        </button>
    )
}
