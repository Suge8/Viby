import { MessagePrimitive } from '@assistant-ui/react'
import { MarkdownText } from '@/components/assistant-ui/markdown-text'
import { Reasoning, ReasoningGroup } from '@/components/assistant-ui/reasoning'
import { VibyToolMessage } from '@/components/AssistantChat/messages/ToolMessage'

const TOOL_COMPONENTS = {
    Fallback: VibyToolMessage
} as const

const MESSAGE_PART_COMPONENTS = {
    Text: MarkdownText,
    Reasoning: Reasoning,
    ReasoningGroup: ReasoningGroup,
    tools: TOOL_COMPONENTS
} as const

export default function RichAssistantToolMessageContent(): React.JSX.Element {
    return <MessagePrimitive.Content components={MESSAGE_PART_COMPONENTS} />
}
