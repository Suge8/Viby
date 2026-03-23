import { lazy, Suspense } from 'react'
import { MessagePrimitive, useAssistantState } from '@assistant-ui/react'
import { CliOutputMessageContent } from '@/components/AssistantChat/messages/CliOutputMessageContent'
import { MessageSurface } from '@/components/AssistantChat/messages/MessageSurface'
import { PlainAssistantMessageContent } from '@/components/AssistantChat/messages/PlainAssistantMessageContent'
import { extractAssistantCopyText } from '@/components/AssistantChat/messages/assistantCopyText'
import { shouldUseRichAssistantRendering } from '@/components/AssistantChat/messages/assistantRichTextHeuristics'
import { THREAD_MESSAGE_ID_ATTRIBUTE } from '@/components/AssistantChat/threadMessageIdentity'
import type { VibyChatMessageMetadata } from '@/lib/assistant-runtime'

const LazyRichAssistantTextMessageContent = lazy(
    async () => import('@/components/AssistantChat/messages/RichAssistantTextMessageContent')
)
const LazyRichAssistantToolMessageContent = lazy(
    async () => import('@/components/AssistantChat/messages/RichAssistantToolMessageContent')
)

export function VibyAssistantMessage() {
    const messageId = useAssistantState(({ message }) => message.id)
    const content = useAssistantState(({ message }) => message.content)
    const isCliOutput = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<VibyChatMessageMetadata> | undefined
        return custom?.kind === 'cli-output'
    })
    const cliText = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<VibyChatMessageMetadata> | undefined
        if (custom?.kind !== 'cli-output') return ''
        return message.content.find((part) => part.type === 'text')?.text ?? ''
    })
    const hasToolCallParts = useAssistantState(({ message }) => {
        if (message.role !== 'assistant') return false
        return message.content.some((part) => part.type === 'tool-call')
    })
    const copyText = useAssistantState(({ message }) => {
        if (message.role !== 'assistant') return null
        return extractAssistantCopyText(message.content)
    })
    const useRichRendering = useAssistantState(({ message }) => {
        if (message.role !== 'assistant') {
            return false
        }

        return shouldUseRichAssistantRendering(message.content)
    })
    const rootClass = hasToolCallParts
        ? 'w-full py-1 min-w-0 max-w-full overflow-x-hidden'
        : 'w-full px-1 min-w-0 max-w-full overflow-x-hidden'

    if (isCliOutput) {
        return (
            <MessagePrimitive.Root
                className="px-1 w-full min-w-0 max-w-full overflow-x-hidden"
                {...{ [THREAD_MESSAGE_ID_ATTRIBUTE]: messageId }}
            >
                <div className="ds-message-card">
                    <CliOutputMessageContent text={cliText} />
                </div>
            </MessagePrimitive.Root>
        )
    }

    return (
        <MessagePrimitive.Root
            className={rootClass}
            {...(!hasToolCallParts ? { [THREAD_MESSAGE_ID_ATTRIBUTE]: messageId } : {})}
        >
            <MessageSurface tone="assistant" copyText={copyText}>
                {useRichRendering ? (
                    <Suspense fallback={<PlainAssistantMessageContent parts={content} />}>
                        {hasToolCallParts ? (
                            <LazyRichAssistantToolMessageContent />
                        ) : (
                            <LazyRichAssistantTextMessageContent />
                        )}
                    </Suspense>
                ) : (
                    <PlainAssistantMessageContent parts={content} />
                )}
            </MessageSurface>
        </MessagePrimitive.Root>
    )
}
