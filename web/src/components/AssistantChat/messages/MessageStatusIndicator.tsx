import type { MessageStatus } from '@/types/api'
import { AlertIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'

export function MessageStatusIndicator(props: {
    status?: MessageStatus
    onRetry?: () => void
}) {
    if (props.status !== 'failed') {
        return null
    }

    return (
        <span className="inline-flex items-center gap-1">
            <span className="text-[var(--ds-danger)]">
                <AlertIcon className="h-[14px] w-[14px]" />
            </span>
            {props.onRetry ? (
                <Button
                    type="button"
                    variant="plain"
                    onClick={props.onRetry}
                    className="min-h-0 px-1.5 py-0.5 text-xs font-medium text-[var(--ds-accent-coral)] shadow-none hover:underline"
                >
                    Retry
                </Button>
            ) : null}
        </span>
    )
}
