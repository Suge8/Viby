import type * as React from 'react'
import { FeatureCheckIcon as CheckIcon } from '@/components/featureIcons'
import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type PressableSurfaceProps = Omit<ButtonProps, 'variant'> & {
    selected?: boolean
    density?: 'default' | 'compact'
}

const PRESSABLE_SURFACE_BASE_CLASS_NAME =
    'w-full rounded-[18px] border text-left text-[var(--ds-text-primary)] shadow-[var(--ds-shadow-soft)] [&>[data-button-content]]:w-full [&>[data-button-content]]:items-start [&>[data-button-content]]:justify-start'

const PRESSABLE_SURFACE_DENSITY_CLASS_NAME: Record<NonNullable<PressableSurfaceProps['density']>, string> = {
    default: 'px-3.5 py-3',
    compact: 'px-3 py-2.5'
}

const PRESSABLE_SURFACE_SELECTED_CLASS_NAME =
    'border-[color:color-mix(in_srgb,var(--ds-brand)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-brand)_8%,var(--ds-panel-strong))] [--ds-button-pointer-color:var(--ds-brand)]'

const PRESSABLE_SURFACE_IDLE_CLASS_NAME =
    'border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_96%,transparent)] hover:border-[var(--ds-border-strong)] hover:bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_90%,var(--app-subtle-bg))]'

export function PressableSurface(props: PressableSurfaceProps): React.JSX.Element {
    const {
        className,
        density = 'default',
        selected = false,
        children,
        ...buttonProps
    } = props

    return (
        <Button
            variant="plain"
            pressStyle="card"
            className={cn(
                PRESSABLE_SURFACE_BASE_CLASS_NAME,
                PRESSABLE_SURFACE_DENSITY_CLASS_NAME[density],
                selected ? PRESSABLE_SURFACE_SELECTED_CLASS_NAME : PRESSABLE_SURFACE_IDLE_CLASS_NAME,
                className
            )}
            {...buttonProps}
        >
            {children}
        </Button>
    )
}

export function PressableSurfaceSelectionIndicator(props: {
    selected: boolean
    className?: string
}): React.JSX.Element {
    return (
        <span
            aria-hidden="true"
            className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                props.selected
                    ? 'border-[color:color-mix(in_srgb,var(--ds-brand)_18%,transparent)] bg-[var(--ds-brand)] text-[var(--ds-text-inverse)]'
                    : 'border-[var(--ds-border-default)] bg-[var(--app-subtle-bg)] text-transparent',
                props.className
            )}
        >
            <CheckIcon className="h-3.5 w-3.5" />
        </span>
    )
}
