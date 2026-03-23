import { MessagePrimitive } from '@assistant-ui/react'
import { MarkdownText } from '@/components/assistant-ui/markdown-text'
import { Reasoning, ReasoningGroup } from '@/components/assistant-ui/reasoning'

const MESSAGE_PART_COMPONENTS = {
    Text: MarkdownText,
    Reasoning: Reasoning,
    ReasoningGroup: ReasoningGroup,
} as const

export default function RichAssistantTextMessageContent(): React.JSX.Element {
    return <MessagePrimitive.Content components={MESSAGE_PART_COMPONENTS} />
}
