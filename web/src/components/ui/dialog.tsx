import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as React from 'react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger

export const DialogContent = React.forwardRef<
    HTMLDivElement,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[var(--ds-overlay)] data-[state=open]:animate-[ds-dialog-overlay-in_var(--ds-motion-base)_var(--ds-ease-emphasized)] data-[state=closed]:animate-[ds-dialog-overlay-out_var(--ds-motion-fast)_var(--ds-ease-standard)]" />
        <DialogPrimitive.Content
            ref={ref}
            className={cn(
                'ds-dialog-surface fixed left-1/2 top-1/2 z-50 w-[calc(100vw-24px)] max-w-lg -translate-x-1/2 -translate-y-1/2 p-5 data-[state=open]:animate-[ds-dialog-content-in_var(--ds-motion-base)_var(--ds-ease-emphasized)] data-[state=closed]:animate-[ds-dialog-content-out_var(--ds-motion-fast)_var(--ds-ease-standard)]',
                className
            )}
            {...props}
        />
    </DialogPrimitive.Portal>
))
DialogContent.displayName = 'DialogContent'

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn('flex flex-col gap-1.5 text-center sm:text-left', className)} {...props} />
)

export const DialogTitle = React.forwardRef<
    HTMLHeadingElement,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Title
        ref={ref}
        className={cn('text-lg font-semibold leading-none tracking-tight', className)}
        {...props}
    />
))
DialogTitle.displayName = 'DialogTitle'

export const DialogDescription = React.forwardRef<
    HTMLParagraphElement,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Description ref={ref} className={cn('text-sm text-[var(--app-hint)]', className)} {...props} />
))
DialogDescription.displayName = 'DialogDescription'
