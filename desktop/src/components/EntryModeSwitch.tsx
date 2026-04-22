import type { JSX } from 'react'
import type { DesktopEntryMode } from '@/types'

const OPTIONS: Array<{ value: DesktopEntryMode; label: string }> = [
    { value: 'local', label: '仅本机' },
    { value: 'lan', label: '局域网' },
]

interface EntryModeSwitchProps {
    value: DesktopEntryMode
    onChange: (value: DesktopEntryMode) => void
    disabled?: boolean
}

export function EntryModeSwitch({ value, onChange, disabled = false }: EntryModeSwitchProps): JSX.Element {
    return (
        <div className={`desktop-mode-switch ${disabled ? 'is-disabled' : ''}`} role="tablist" aria-label="入口模式">
            {OPTIONS.map((option) => {
                const active = option.value === value
                return (
                    <button
                        aria-selected={active}
                        className={`desktop-mode-option ${active ? 'is-active' : ''}`}
                        disabled={disabled}
                        key={option.value}
                        onClick={() => onChange(option.value)}
                        role="tab"
                        type="button"
                    >
                        {option.label}
                    </button>
                )
            })}
        </div>
    )
}
