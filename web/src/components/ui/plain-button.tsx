import * as React from 'react'
import { cn } from '@/lib/utils'

export interface PlainButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

export const PlainButton = React.forwardRef<HTMLButtonElement, PlainButtonProps>(function PlainButton(
    { className, type, ...props },
    ref
) {
    return (
        <button
            ref={ref}
            type={type ?? 'button'}
            className={cn(
                'inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-brand)] disabled:pointer-events-none disabled:opacity-50',
                className
            )}
            {...props}
        />
    )
})
PlainButton.displayName = 'PlainButton'
