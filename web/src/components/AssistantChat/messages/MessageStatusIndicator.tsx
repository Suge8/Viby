import { AlertIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import type { MessageStatus } from '@/types/api'

export function MessageStatusIndicator(props: { status?: MessageStatus; onRetry?: () => void }) {
    if (props.status !== 'failed') {
        return null
    }

    return (
        <span className="inline-flex items-center gap-1">
            <span className="text-[var(--ds-danger)]">
                <AlertIcon className="ds-message-status-icon" />
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
