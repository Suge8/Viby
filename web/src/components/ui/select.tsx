import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
    { className, children, ...props },
    ref
) {
    return (
        <select
            ref={ref}
            className={cn(
                'min-h-[var(--ds-touch-target)] w-full rounded-[var(--ds-field-radius)] border border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_96%,transparent)] px-4 py-3 text-sm font-medium text-[var(--ds-text-primary)] outline-none transition-[border-color,box-shadow,background-color] focus:border-[var(--ds-border-strong)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--ds-brand)_18%,transparent)] disabled:opacity-50',
                className
            )}
            {...props}
        >
            {children}
        </select>
    )
})
Select.displayName = 'Select'
