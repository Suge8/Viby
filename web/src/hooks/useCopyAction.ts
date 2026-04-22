import { useCallback } from 'react'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { COPY_FEEDBACK_DURATION_MS } from '@/lib/copyFeedback'

type UseCopyActionOptions = {
    text: string
    enabled?: boolean
    onCopied?: () => void
}

type CopyClickEvent = React.MouseEvent<HTMLButtonElement>

export function useCopyAction(options: UseCopyActionOptions): {
    copied: boolean
    handleCopyClick: (event: CopyClickEvent) => Promise<void>
} {
    const { copied, copy } = useCopyToClipboard(COPY_FEEDBACK_DURATION_MS)
    const { enabled = true, onCopied, text } = options

    const handleCopyClick = useCallback(
        async (event: CopyClickEvent): Promise<void> => {
            event.preventDefault()
            event.stopPropagation()

            if (!enabled) {
                return
            }

            const didCopy = await copy(text)
            if (didCopy) {
                onCopied?.()
            }
        },
        [copy, enabled, onCopied, text]
    )

    return { copied, handleCopyClick }
}
