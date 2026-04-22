import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
    trackClassName?: string
    thumbClassName?: string
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(function Switch(
    { className, trackClassName, thumbClassName, ...props },
    ref
) {
    return (
        <span className={cn('relative inline-flex h-6 w-11 shrink-0 items-center', className)}>
            <input
                ref={ref}
                type="checkbox"
                role="switch"
                className="peer absolute inset-0 m-0 cursor-pointer rounded-full opacity-0 disabled:cursor-not-allowed"
                {...props}
            />
            <span
                aria-hidden="true"
                className={cn(
                    'pointer-events-none absolute inset-0 rounded-full bg-[var(--ds-border-default)] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ds-brand)] peer-checked:bg-[var(--ds-brand)] peer-disabled:opacity-50',
                    trackClassName
                )}
            />
            <span
                aria-hidden="true"
                className={cn(
                    'pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-[var(--ds-panel-strong)] transition-transform peer-checked:translate-x-5 peer-disabled:opacity-50',
                    thumbClassName
                )}
            />
        </span>
    )
})
Switch.displayName = 'Switch'
