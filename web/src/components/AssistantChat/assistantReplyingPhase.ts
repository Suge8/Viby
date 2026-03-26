import type { PendingReplyState } from '@/lib/message-window-store'

export type AssistantReplyingPhase = 'sending' | 'preparing' | 'replying'

export function resolveAssistantReplyingPhase(options: {
    isResponding: boolean
    pendingReply: PendingReplyState | null
}): AssistantReplyingPhase | null {
    if (options.isResponding) {
        return 'replying'
    }

    return options.pendingReply?.phase ?? null
}
