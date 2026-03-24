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

export function SegmentedControl({
    options,
    value,
    onChange,
    disabled = false
}: SegmentedControlProps) {
    return (
        <div className={`flex items-center gap-1 rounded-lg bg-slate-800/80 p-1 border border-slate-700/80 ${disabled ? 'opacity-50' : ''}`}>
            {options.map((option) => {
                const active = option.value === value
                return (
                    <button
                        aria-selected={active}
                        className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                            active
                                ? 'bg-sky-600/50 text-white'
                                : 'text-slate-300 hover:text-white'
                        }`}
                        disabled={disabled}
                        key={option.value}
                        onClick={() => onChange(option.value)}
                        type="button"
                    >
                        {option.label}
                    </button>
                )
            })}
        </div>
    )
}
