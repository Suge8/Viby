import type { CSSProperties } from 'react'
import { useTranslation } from '@/lib/use-translation'
import {
    type AssistantReplyingPhase,
} from '@/components/AssistantChat/assistantReplyingPhase'
import { REPLYING_INDICATOR_EXIT_DURATION_MS } from '@/components/AssistantChat/useReplyingIndicatorPresence'

const REPLYING_DOT_DELAYS_MS = [0, 160, 320] as const

type ReplyingDotProps = {
    delayMs: number
}

function ReplyingDot(props: ReplyingDotProps): React.JSX.Element {
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

export function AssistantReplyingIndicator(props: {
    phase: AssistantReplyingPhase
    state?: 'active' | 'exiting'
}): React.JSX.Element {
    const { t } = useTranslation()
    const accessibleLabel = t(getReplyingTitleKey(props.phase))
    const state = props.state ?? 'active'

    return (
        <div
            className="ds-replying-indicator-shell pointer-events-none flex w-full justify-center py-1"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-label={accessibleLabel}
            data-state={state}
            style={{
                '--ds-replying-indicator-exit-duration': `${REPLYING_INDICATOR_EXIT_DURATION_MS}ms`
            } as CSSProperties}
        >
            <div
                data-testid="assistant-replying-indicator"
                data-phase={props.phase}
                className="ds-replying-indicator"
            >
                <span className="ds-replying-indicator-track" aria-hidden="true">
                    {REPLYING_DOT_DELAYS_MS.map((delayMs) => (
                        <ReplyingDot key={delayMs} delayMs={delayMs} />
                    ))}
                </span>
            </div>
        </div>
    )
}
