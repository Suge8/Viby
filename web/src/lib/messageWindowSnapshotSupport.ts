import type { MessageWindowWarmSnapshot } from '@/lib/messageWindowWarmSnapshot'
import type { DecryptedMessage } from '@/types/api'

export function deriveSeqBounds(messages: DecryptedMessage[]): { oldestSeq: number | null; newestSeq: number | null } {
    let oldest: number | null = null
    let newest: number | null = null

    for (const message of messages) {
        if (typeof message.seq !== 'number') {
            continue
        }
        if (oldest === null || message.seq < oldest) {
            oldest = message.seq
        }
        if (newest === null || message.seq > newest) {
            newest = message.seq
        }
    }

    return { oldestSeq: oldest, newestSeq: newest }
}

export function createWarmSnapshot(state: {
    sessionId: string
    messages: DecryptedMessage[]
    hasLoadedLatest: boolean
    hasMore: boolean
    historyExpanded: boolean
    atBottom: boolean
}): MessageWindowWarmSnapshot {
    return {
        sessionId: state.sessionId,
        messages: [...state.messages],
        hasLoadedLatest: state.hasLoadedLatest,
        hasMore: state.hasMore,
        historyExpanded: state.historyExpanded,
        atBottom: state.atBottom,
    }
}
