import { type AssistantReplyingPhase } from '@/components/AssistantChat/assistantReplyingPhase'
import { useTranslation } from '@/lib/use-translation'

const REPLYING_DOT_DELAYS_MS = [0, 160, 320] as const

function ReplyingDot(props: { delayMs: number }): React.JSX.Element {
    return (
        <span
            aria-hidden="true"
            className="ds-replying-indicator-dot"
            style={{ animationDelay: `${props.delayMs}ms` }}
        />
    )
}

function getReplyingTitleKey(phase: AssistantReplyingPhase): string {
    switch (phase) {
        case 'sending':
            return 'assistant.sending.title'
        case 'preparing':
            return 'assistant.preparing.title'
        case 'replying':
            return 'assistant.responding.title'
    }
}

export function AssistantReplyingIndicator(props: { phase: AssistantReplyingPhase }): React.JSX.Element {
    const { t } = useTranslation()
    const accessibleLabel = t(getReplyingTitleKey(props.phase))

    return (
        <div
            data-testid="assistant-replying-indicator"
            data-phase={props.phase}
            className="ds-replying-indicator"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-label={accessibleLabel}
        >
            <span className="ds-replying-indicator-track" aria-hidden="true">
                {REPLYING_DOT_DELAYS_MS.map((delayMs) => (
                    <ReplyingDot key={delayMs} delayMs={delayMs} />
                ))}
            </span>
        </div>
    )
}
