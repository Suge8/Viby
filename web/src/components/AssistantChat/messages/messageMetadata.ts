import type { VibyChatMessageMetadata } from '@/lib/assistant-runtime'

type MessageWithCustomMetadata = {
    metadata?: {
        custom?: unknown
    }
}

export function getVibyMessageMetadata(
    message: MessageWithCustomMetadata
): Partial<VibyChatMessageMetadata> | undefined {
    return message.metadata?.custom as Partial<VibyChatMessageMetadata> | undefined
}
