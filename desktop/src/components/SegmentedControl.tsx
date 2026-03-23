import { memo } from 'react'

interface SegmentedOption {
    value: string
    label: string
}

interface SegmentedControlProps {
    options: readonly SegmentedOption[]
    value: string
    onChange: (value: string) => void
    disabled?: boolean
}

export const SegmentedControl = memo(function SegmentedControl({
    options,
    value,
    onChange,
    disabled = false
}: SegmentedControlProps) {
    return (
        <div className="segmented-control" role="tablist">
            {options.map((option) => {
                const active = option.value === value
                return (
                    <button
                        aria-selected={active}
                        className={active ? 'segmented-option segmented-option-active' : 'segmented-option'}
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
})
