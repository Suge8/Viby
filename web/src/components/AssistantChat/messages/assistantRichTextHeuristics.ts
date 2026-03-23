import { isLikelyMarkdownText } from '@/components/richTextHeuristics'

type AssistantMessagePart =
    | { type: 'text'; text: string }
    | { type: 'reasoning'; text: string }
    | { type: 'tool-call'; toolName?: string }
    | { type: string; text?: string; toolName?: string }

export function shouldUseRichAssistantRendering(parts: readonly AssistantMessagePart[]): boolean {
    return parts.some((part) => {
        if (part.type === 'tool-call' || part.type === 'reasoning') {
            return true
        }

        if (part.type === 'text') {
            return typeof part.text === 'string' ? isLikelyMarkdownText(part.text) : true
        }

        return true
    })
}
