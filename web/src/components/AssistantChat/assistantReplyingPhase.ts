import type { PendingReplyState } from '@/lib/message-window-store'

export type AssistantReplyingPhase = 'sending' | 'preparing' | 'replying'

export function resolveAssistantReplyingPhase(options: {
    thinking: boolean
    pendingReply: PendingReplyState | null
}): AssistantReplyingPhase | null {
    if (options.thinking) {
        return 'replying'
    }

    return options.pendingReply?.phase ?? null
}
