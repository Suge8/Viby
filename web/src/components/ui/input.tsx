import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input({ className, ...props }, ref) {
    return (
        <input
            ref={ref}
            className={cn(
                'min-h-[var(--ds-touch-target)] w-full rounded-[var(--ds-field-radius)] border border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_96%,transparent)] px-4 py-3 text-sm text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)] outline-none transition-[border-color,box-shadow,background-color] focus:border-[var(--ds-border-strong)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--ds-brand)_18%,transparent)] disabled:opacity-50',
                className
            )}
            {...props}
        />
    )
})
Input.displayName = 'Input'
