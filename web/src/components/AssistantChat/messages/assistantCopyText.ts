import type { ThreadAssistantMessagePart } from '@assistant-ui/react'

function isCopyableTextPart(
    part: ThreadAssistantMessagePart
): part is Extract<ThreadAssistantMessagePart, { type: 'text' | 'reasoning' }> {
    return part.type === 'text' || part.type === 'reasoning'
}

export function extractAssistantCopyText(parts: readonly ThreadAssistantMessagePart[]): string | null {
    const segments: string[] = []

    for (const part of parts) {
        if (!isCopyableTextPart(part)) {
            continue
        }

        const nextText = part.text.trim()
        if (nextText.length === 0) {
            continue
        }

        segments.push(nextText)
    }

    if (segments.length === 0) {
        return null
    }

    return segments.join('\n\n')
}
