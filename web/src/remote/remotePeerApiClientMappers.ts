import type { PairingRemoteSessionSummary } from '@viby/protocol'
import type { DecryptedMessage, MessagesResponse, Session, SessionRecoveryPage, SessionSummary } from '@/types/api'

export const REMOTE_PAGE_LIMIT = 50

export function toMessagesResponse(messages: DecryptedMessage[], limit: number): MessagesResponse {
    return {
        messages,
        page: { limit, beforeSeq: null, nextBeforeSeq: null, hasMore: false },
    }
}

export function toRecoveryPage(
    session: Session,
    messages: DecryptedMessage[],
    afterSeq: number,
    limit: number
): SessionRecoveryPage {
    const nextAfterSeq = messages.reduce((cursor, message) => {
        return typeof message.seq === 'number' && message.seq > cursor ? message.seq : cursor
    }, afterSeq)
    return {
        session,
        messages,
        page: { afterSeq, nextAfterSeq, limit, hasMore: false },
    }
}

export function toSessionSummary(session: PairingRemoteSessionSummary): SessionSummary {
    return {
        id: session.id,
        active: session.active,
        thinking: session.thinking,
        activeAt: session.updatedAt,
        updatedAt: session.updatedAt,
        latestActivityAt: session.latestActivityAt,
        latestActivityKind: null,
        latestCompletedReplyAt: null,
        lifecycleState: session.lifecycleState,
        lifecycleStateSince: null,
        metadata: session.metadata
            ? {
                  name: session.metadata.name,
                  path: session.metadata.path,
                  driver: session.metadata.driver,
                  summary: session.metadata.summary,
              }
            : null,
        todoProgress: null,
        pendingRequestsCount: 0,
        resumeAvailable: session.resumeAvailable,
        resumeStrategy: session.resumeAvailable ? 'transcript-replay' : 'none',
        model: session.model,
        modelReasoningEffort: null,
        codexServiceTier: session.codexServiceTier,
    }
}
