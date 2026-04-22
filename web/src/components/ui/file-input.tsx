import * as React from 'react'
import { cn } from '@/lib/utils'

export interface FileInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {}

export const FileInput = React.forwardRef<HTMLInputElement, FileInputProps>(function FileInput(
    { className, ...props },
    ref
) {
    return <input ref={ref} type="file" className={cn('sr-only', className)} {...props} />
})
FileInput.displayName = 'FileInput'
