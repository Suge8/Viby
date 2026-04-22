import * as React from 'react'
import { cn } from '@/lib/utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
    { className, ...props },
    ref
) {
    return (
        <textarea
            ref={ref}
            className={cn(
                'min-h-[var(--ds-field-textarea-min-height)] w-full resize-y rounded-[var(--ds-field-radius)] border border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_96%,transparent)] px-4 py-3 text-sm text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)] outline-none transition-[border-color,box-shadow,background-color] focus:border-[var(--ds-border-strong)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--ds-brand)_18%,transparent)] disabled:opacity-50',
                className
            )}
            {...props}
        />
    )
})
Textarea.displayName = 'Textarea'
