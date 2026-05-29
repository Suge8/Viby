import { LayoutGroup, m } from 'motion/react'
import type { JSX, ReactNode } from 'react'

// One segmented-control implementation backs every horizontal pill row in the
// desktop shell: Settings (theme/language radiogroup), Agents view switch,
// and Agent Config driver tabs. layoutId drives the FLIP pill animation so the
// active background slides between segments instead of teleporting.

const PILL_SPRING = { type: 'spring' as const, stiffness: 380, damping: 32, mass: 0.7 }

type DesktopSegmentedOption<T extends string> = {
    value: T
    label: string
    badge?: ReactNode
}

type DesktopSegmentedControlProps<T extends string> = {
    ariaLabel: string
    options: readonly DesktopSegmentedOption<T>[]
    value: T
    onChange(value: T): void
    layoutId: string
    role?: 'radiogroup' | 'tablist'
    fill?: boolean
    renderItem?(option: DesktopSegmentedOption<T>): ReactNode
}

export function DesktopSegmentedControl<T extends string>(props: DesktopSegmentedControlProps<T>): JSX.Element {
    const role = props.role ?? 'radiogroup'
    const itemRole = role === 'tablist' ? 'tab' : 'radio'
    const ariaActiveKey = role === 'tablist' ? 'aria-selected' : 'aria-checked'
    const fillStyle = props.fill
        ? { gridTemplateColumns: `repeat(${props.options.length}, minmax(0, 1fr))` }
        : undefined

    return (
        <LayoutGroup id={`desktop-segmented-${props.layoutId}`}>
            <div
                role={role}
                aria-label={props.ariaLabel}
                className={props.fill ? 'desktop-segmented-control is-fill' : 'desktop-segmented-control'}
                style={fillStyle}
            >
                {props.options.map((option) => {
                    const active = option.value === props.value
                    return (
                        <button
                            key={option.value}
                            type="button"
                            role={itemRole}
                            {...{ [ariaActiveKey]: active }}
                            className={active ? 'is-selected' : ''}
                            onClick={() => props.onChange(option.value)}
                        >
                            {active ? (
                                <m.span
                                    layoutId={`desktop-segmented-${props.layoutId}-pill`}
                                    className="desktop-segmented-pill"
                                    transition={PILL_SPRING}
                                />
                            ) : null}
                            <span className="desktop-segmented-content">
                                {props.renderItem ? props.renderItem(option) : option.label}
                            </span>
                            {option.badge ? <span className="desktop-segmented-badge">{option.badge}</span> : null}
                        </button>
                    )
                })}
            </div>
        </LayoutGroup>
    )
}
