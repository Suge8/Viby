import { MessagePrimitive, useAssistantState } from '@assistant-ui/react'
import { CliOutputMessageContent } from '@/components/AssistantChat/messages/CliOutputMessageContent'
import { useVibyChatContext } from '@/components/AssistantChat/context'
import { getVibyMessageMetadata } from '@/components/AssistantChat/messages/messageMetadata'
import { THREAD_MESSAGE_ID_ATTRIBUTE } from '@/components/AssistantChat/threadMessageIdentity'
import { MessageStatusIndicator } from '@/components/AssistantChat/messages/MessageStatusIndicator'
import { MessageAttachments } from '@/components/AssistantChat/messages/MessageAttachments'
import { MessageSurface } from '@/components/AssistantChat/messages/MessageSurface'
import { TextContent } from '@/components/TextContent'

export function VibyUserMessage() {
    const ctx = useVibyChatContext()
    const messageId = useAssistantState(({ message }) => message.id)
    const role = useAssistantState(({ message }) => message.role)
    const text = useAssistantState(({ message }) => {
        if (message.role !== 'user') return ''
        return message.content.find((part) => part.type === 'text')?.text ?? ''
    })
    const status = useAssistantState(({ message }) => {
        if (message.role !== 'user') return undefined
        const custom = getVibyMessageMetadata(message)
        return custom?.status
    })
    const localId = useAssistantState(({ message }) => {
        if (message.role !== 'user') return null
        const custom = getVibyMessageMetadata(message)
        return custom?.localId ?? null
    })
    const attachments = useAssistantState(({ message }) => {
        if (message.role !== 'user') return undefined
        const custom = getVibyMessageMetadata(message)
        return custom?.attachments
    })
    const renderMode = useAssistantState(({ message }) => {
        if (message.role !== 'user') return 'plain'
        const custom = getVibyMessageMetadata(message)
        return custom?.renderMode ?? 'plain'
    })
    const isCliOutput = useAssistantState(({ message }) => {
        const custom = getVibyMessageMetadata(message)
        return custom?.kind === 'cli-output'
    })
    const cliText = useAssistantState(({ message }) => {
        const custom = getVibyMessageMetadata(message)
        if (custom?.kind !== 'cli-output') return ''
        return message.content.find((part) => part.type === 'text')?.text ?? ''
    })

    if (role !== 'user') return null
    const canRetry = status === 'failed' && typeof localId === 'string' && Boolean(ctx.onRetryMessage)
    const onRetry = canRetry ? () => ctx.onRetryMessage!(localId) : undefined

    if (isCliOutput) {
        return (
            <MessagePrimitive.Root
                className="px-1 min-w-0 max-w-full overflow-x-hidden"
                {...{ [THREAD_MESSAGE_ID_ATTRIBUTE]: messageId }}
            >
                <div className="ds-message-card-right">
                    <CliOutputMessageContent text={cliText} />
                </div>
            </MessagePrimitive.Root>
        )
    }

    const hasText = text.length > 0
    const hasAttachments = attachments && attachments.length > 0

    return (
        <MessagePrimitive.Root
            className="flex min-w-0 max-w-full justify-end px-1"
            {...{ [THREAD_MESSAGE_ID_ATTRIBUTE]: messageId }}
        >
            <MessageSurface tone="user" copyText={hasText ? text : null}>
                <div className="flex min-w-0 items-end gap-2">
                    <div className="min-w-0 flex-1">
                        {hasText && <TextContent text={text} mode={renderMode} />}
                        {hasAttachments && <MessageAttachments attachments={attachments} />}
                    </div>
                    {status ? (
                        <div className="shrink-0 self-end pb-0.5">
                            <MessageStatusIndicator status={status} onRetry={onRetry} />
                        </div>
                    ) : null}
                </div>
            </MessageSurface>
        </MessagePrimitive.Root>
    )
}
