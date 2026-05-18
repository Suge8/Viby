import * as React from 'react'
import { useButtonPending } from '@/components/ui/buttonPending'
import { cn } from '@/lib/utils'

export interface PlainButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

export const PlainButton = React.forwardRef<HTMLButtonElement, PlainButtonProps>(function PlainButton(
    { className, onClick, type, ...props },
    ref
) {
    const [pending, handleClick] = useButtonPending(onClick)
    const disabled = props.disabled || pending
    return (
        <button
            {...props}
            ref={ref}
            type={type ?? 'button'}
            disabled={disabled}
            aria-busy={pending || props['aria-busy'] || undefined}
            data-pending={pending ? 'true' : undefined}
            className={cn(
                'inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-brand)] disabled:pointer-events-none disabled:opacity-50',
                className
            )}
            onClick={handleClick}
        />
    )
})
PlainButton.displayName = 'PlainButton'
