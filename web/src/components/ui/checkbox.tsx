import * as React from 'react'
import { FeatureCheckIcon as CheckIcon } from '@/components/featureIcons'
import { cn } from '@/lib/utils'

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
    indicatorClassName?: string
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
    { className, indicatorClassName, ...props },
    ref
) {
    return (
        <span className={cn('relative inline-flex h-5 w-5 shrink-0', className)}>
            <input
                ref={ref}
                type="checkbox"
                className="peer ds-checkbox-input absolute inset-0 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                {...props}
            />
            <span
                aria-hidden="true"
                className={cn(
                    'ds-checkbox-indicator pointer-events-none inline-flex h-5 w-5 items-center justify-center peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ds-brand)] peer-disabled:opacity-50 peer-checked:border-[var(--ds-brand)] peer-checked:bg-[var(--ds-brand)] peer-checked:text-[var(--ds-text-inverse)]',
                    indicatorClassName
                )}
            >
                <CheckIcon className="h-3.5 w-3.5" />
            </span>
        </span>
    )
})
Checkbox.displayName = 'Checkbox'
