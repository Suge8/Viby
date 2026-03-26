import { lazy, Suspense } from 'react'
import type { ThreadAssistantMessagePart } from '@assistant-ui/react'
import { MessagePrimitive, useAssistantState } from '@assistant-ui/react'
import { CliOutputMessageContent } from '@/components/AssistantChat/messages/CliOutputMessageContent'
import { MessageSurface } from '@/components/AssistantChat/messages/MessageSurface'
import { getVibyMessageMetadata } from '@/components/AssistantChat/messages/messageMetadata'
import { PlainAssistantMessageContent } from '@/components/AssistantChat/messages/PlainAssistantMessageContent'
import { extractAssistantCopyText } from '@/components/AssistantChat/messages/assistantCopyText'
import { THREAD_MESSAGE_ID_ATTRIBUTE } from '@/components/AssistantChat/threadMessageIdentity'

const LazyRichAssistantTextMessageContent = lazy(
    async () => import('@/components/AssistantChat/messages/RichAssistantTextMessageContent')
)
const LazyRichAssistantToolMessageContent = lazy(
    async () => import('@/components/AssistantChat/messages/RichAssistantToolMessageContent')
)

function renderAssistantContent(props: {
    content: readonly ThreadAssistantMessagePart[]
    hasToolCallParts: boolean
    hasReasoningParts: boolean
    renderMode: 'plain' | 'markdown'
}): React.JSX.Element {
    if (props.hasToolCallParts) {
        return (
            <Suspense fallback={<PlainAssistantMessageContent parts={props.content} />}>
                <LazyRichAssistantToolMessageContent />
            </Suspense>
        )
    }

    if (props.hasReasoningParts || props.renderMode === 'markdown') {
        return (
            <Suspense fallback={<PlainAssistantMessageContent parts={props.content} />}>
                <LazyRichAssistantTextMessageContent />
            </Suspense>
        )
    }

    return <PlainAssistantMessageContent parts={props.content} />
}

function hasRenderableAssistantContent(content: readonly ThreadAssistantMessagePart[]): boolean {
    return content.some((part) => {
        if (part.type === 'tool-call') {
            return true
        }

        if (part.type === 'text' || part.type === 'reasoning') {
            return part.text.trim().length > 0
        }

        return false
    })
}

export function VibyAssistantMessage() {
    const messageId = useAssistantState(({ message }) => message.id)
    const role = useAssistantState(({ message }) => message.role)
    const assistantContent = useAssistantState(
        ({ message }): readonly ThreadAssistantMessagePart[] =>
            message.role === 'assistant' ? message.content : []
    )
    const isCliOutput = useAssistantState(({ message }) => {
        const custom = getVibyMessageMetadata(message)
        return custom?.kind === 'cli-output'
    })
    const cliText = useAssistantState(({ message }) => {
        const custom = getVibyMessageMetadata(message)
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
    const renderMode = useAssistantState(({ message }) => {
        if (message.role !== 'assistant') return 'plain'
        const custom = getVibyMessageMetadata(message)
        return custom?.renderMode ?? 'plain'
    })
    const hasReasoningParts = useAssistantState(({ message }) => {
        if (message.role !== 'assistant') return false
        return message.content.some((part) => part.type === 'reasoning')
    })
    const hasRenderableContent = useAssistantState(({ message }) => {
        if (message.role !== 'assistant') return false
        return hasRenderableAssistantContent(message.content)
    })

    if (role !== 'assistant') {
        return null
    }

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

    if (!hasRenderableContent) {
        return null
    }

    return (
        <MessagePrimitive.Root
            className={rootClass}
            {...(!hasToolCallParts ? { [THREAD_MESSAGE_ID_ATTRIBUTE]: messageId } : {})}
        >
            <MessageSurface tone="assistant" copyText={copyText}>
                {renderAssistantContent({
                    content: assistantContent,
                    hasToolCallParts,
                    hasReasoningParts,
                    renderMode,
                })}
            </MessageSurface>
        </MessagePrimitive.Root>
    )
}
