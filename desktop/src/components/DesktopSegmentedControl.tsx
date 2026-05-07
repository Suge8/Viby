import type { JSX } from 'react'

type DesktopSegmentedOption<T extends string> = {
    label: string
    value: T
}

type DesktopSegmentedControlProps<T extends string> = {
    ariaLabel: string
    options: readonly DesktopSegmentedOption<T>[]
    value: T
    onChange(value: T): void
}

export function DesktopSegmentedControl<T extends string>(props: DesktopSegmentedControlProps<T>): JSX.Element {
    return (
        <div className="desktop-segmented-control" role="radiogroup" aria-label={props.ariaLabel}>
            {props.options.map((option) => (
                <button
                    type="button"
                    key={option.value}
                    className={props.value === option.value ? 'is-selected' : ''}
                    aria-checked={props.value === option.value}
                    role="radio"
                    onClick={() => props.onChange(option.value)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    )
}
