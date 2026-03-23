type CopyableAssistantPart =
    | { type: 'text'; text: string }
    | { type: 'reasoning'; text: string }
    | { type: string }

function isCopyableTextPart(
    part: CopyableAssistantPart
): part is Extract<CopyableAssistantPart, { type: 'text' | 'reasoning' }> {
    return part.type === 'text' || part.type === 'reasoning'
}

export function extractAssistantCopyText(parts: readonly CopyableAssistantPart[]): string | null {
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
