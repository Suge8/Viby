import { extractAssistantTurnId } from '@viby/protocol'
import { isUserMessage } from '@/lib/messages'
import type { PendingReplyState } from '@/lib/messageWindowState'
import type { DecryptedMessage, SessionStreamState } from '@/types/api'

export function resolveStreamAfterMessages(
    stream: SessionStreamState | null,
    messages: DecryptedMessage[]
): SessionStreamState | null {
    if (!stream) {
        return null
    }

    for (const message of messages) {
        if (extractAssistantTurnId(message.content) === stream.assistantTurnId) {
            return null
        }
    }

    return stream
}

export function resolvePendingReplyAfterMessages(
    pendingReply: PendingReplyState | null,
    messages: readonly DecryptedMessage[]
): PendingReplyState | null {
    if (!pendingReply) {
        return null
    }

    for (const message of messages) {
        if (isUserMessage(message)) {
            continue
        }
        if (message.createdAt >= pendingReply.requestStartedAt) {
            return null
        }
    }

    return pendingReply
}
