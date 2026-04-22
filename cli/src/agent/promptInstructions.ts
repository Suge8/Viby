import { trimIdent } from '@/utils/trimIdent'

export function mergePromptSegments(...segments: Array<string | null | undefined>): string | undefined {
    const normalized = segments
        .map((segment) => (typeof segment === 'string' ? segment.trim() : undefined))
        .filter((segment): segment is string => Boolean(segment))

    return normalized.length > 0 ? normalized.join('\n\n') : undefined
}

export function prependPromptInstructionsToMessage(message: string, instructions?: string): string {
    const normalizedInstructions = mergePromptSegments(instructions)
    if (!normalizedInstructions) {
        return message
    }

    return trimIdent(`
        Session instructions:
        ${normalizedInstructions}

        User message:
        ${message}
    `)
}
