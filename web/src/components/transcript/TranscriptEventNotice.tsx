import { memo, useCallback } from 'react'
import { CONTINUE_GENERATION_PROMPT } from '@/chat/continueGeneration'
import { getEventPresentation } from '@/chat/presentation'
import type { AgentEvent } from '@/chat/types'
import { AppNotice } from '@/components/AppNotice'
import { useOptionalVibyChatContext } from '@/components/AssistantChat/context'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/use-translation'

type TranscriptEventNoticeProps = {
    event: AgentEvent
}

function EventDetail(props: { detail: string; label: string }): React.JSX.Element {
    return (
        <details className="mt-2 text-xs">
            <summary className="cursor-pointer select-none text-[var(--app-muted)]">{props.label}</summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-2 font-mono text-xs leading-relaxed text-[var(--app-muted)]">
                {props.detail}
            </pre>
        </details>
    )
}

function TranscriptEventNoticeComponent(props: TranscriptEventNoticeProps): React.JSX.Element {
    const { t } = useTranslation()
    const chat = useOptionalVibyChatContext()
    const presentation = getEventPresentation(props.event)
    const handleContinue = useCallback(() => chat?.onSend?.(CONTINUE_GENERATION_PROMPT), [chat])
    const continueAction =
        props.event.type === 'turn-terminal' && props.event.status === 'truncated' && chat?.onSend ? (
            <Button type="button" size="sm" variant="outline" disabled={chat.disabled} onClick={handleContinue}>
                {t('chat.continueGeneration')}
            </Button>
        ) : null
    const detail = presentation.detail ? (
        <EventDetail detail={presentation.detail} label={t('chat.eventDetails')} />
    ) : null

    if (props.event.type === 'assistant-error') {
        return (
            <div className="ds-transcript-status-line" data-tone={presentation.tone}>
                {presentation.icon ? <span aria-hidden="true">{presentation.icon}</span> : null}
                <div className="min-w-0">
                    <span>{presentation.text}</span>
                    {detail}
                </div>
            </div>
        )
    }

    return (
        <AppNotice
            layout="inline"
            tone={presentation.tone}
            icon={presentation.icon ? <span aria-hidden="true">{presentation.icon}</span> : undefined}
            title={presentation.text}
            description={detail ?? undefined}
            className="ds-transcript-notice-shell"
            action={continueAction}
        />
    )
}

export const TranscriptEventNotice = memo(TranscriptEventNoticeComponent)
TranscriptEventNotice.displayName = 'TranscriptEventNotice'
