import type { QueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { DecryptedMessage, Session } from '@/types/api'
import {
    clearMessageWindowWarning,
    clearPendingReply,
    getMessageWindowState,
    setMessageWindowWarning
} from '@/lib/messageWindowStoreCore'
import { isUserMessage } from '@/lib/messages'
import {
    isPostSwitchMessageWindowWarningKey,
    MESSAGE_WINDOW_POST_SWITCH_NO_REPLY_WARNING_KEY,
    MESSAGE_WINDOW_POST_SWITCH_SEND_FAILED_WARNING_KEY,
    type MessageWindowWarningKey
} from '@/lib/messageWindowWarnings'
import { loadMessageWindowStoreAsyncModule } from '@/lib/messageWindowStoreModule'
import { queryKeys } from '@/lib/query-keys'
import { appendRealtimeTrace } from '@/lib/realtimeTrace'
import { findFirstAgentReplyAfter, runSendCatchup, shouldRunPostSwitchCatchup } from '@/lib/sendCatchup'
import { writeSessionToQueryCache } from '@/lib/sessionQueryCache'

export type AcceptedSend = {
    sessionId: string
    localId: string
    createdAt: number
    acceptedAt: number
    session: Session
}

type SyncResolvedPostSwitchWarningOptions = {
    sessionId: string
    messages: readonly DecryptedMessage[]
    warning: MessageWindowWarningKey | null
    streamText: string
}

type HandleAcceptedSendOptions = {
    acceptedSend: AcceptedSend
    api: ApiClient
    queryClient: QueryClient
}

export function syncResolvedPostSwitchWarning(options: SyncResolvedPostSwitchWarningOptions): void {
    const { messages, sessionId, streamText, warning } = options
    if (!isPostSwitchMessageWindowWarningKey(warning)) {
        return
    }
    if (streamText.length > 0) {
        clearMessageWindowWarning(sessionId, warning)
        return
    }

    const latestUserCreatedAt = findLatestUserMessageCreatedAt(messages)
    if (latestUserCreatedAt === null) {
        return
    }
    if (!findFirstAgentReplyAfter(messages, latestUserCreatedAt)) {
        return
    }

    clearMessageWindowWarning(sessionId, warning)
}

export async function handleAcceptedSend(options: HandleAcceptedSendOptions): Promise<void> {
    const { acceptedSend, api, queryClient } = options
    const { acceptedAt, createdAt, session, sessionId } = acceptedSend

    appendRealtimeTrace({
        at: acceptedAt,
        type: 'server_accepted',
        details: {
            sessionId,
            waitMs: acceptedAt - createdAt
        }
    })

    clearCurrentPostSwitchWarning(sessionId)
    writeSessionToQueryCache(queryClient, session)

    const currentMessages = getMessageWindowState(sessionId).messages
    if (!shouldRunPostSwitchCatchup(currentMessages, createdAt)) {
        return
    }

    try {
        const outcome = await runSendCatchup({
            createdAt,
            syncOnce: async () => {
                await queryClient.fetchQuery({
                    queryKey: queryKeys.session(sessionId),
                    queryFn: () => api.getSession(sessionId),
                })

                const { fetchLatestMessages } = await loadMessageWindowStoreAsyncModule()
                await fetchLatestMessages(api, sessionId)

                return {
                    messages: getMessageWindowState(sessionId).messages
                }
            }
        })

        if (outcome.type === 'reply-detected') {
            clearCurrentPostSwitchWarning(sessionId)
            appendRealtimeTrace({
                at: Date.now(),
                type: 'first_reply_detected',
                details: {
                    sessionId,
                    replyId: outcome.reply.id,
                    replyCreatedAt: outcome.reply.createdAt,
                    attempt: outcome.attempt,
                    waitMs: Date.now() - createdAt
                }
            })
            return
        }

        clearPendingReply(sessionId)
        if (outcome.type === 'driver-switch-send-failed') {
            setMessageWindowWarning(sessionId, MESSAGE_WINDOW_POST_SWITCH_SEND_FAILED_WARNING_KEY)
            appendRealtimeTrace({
                at: Date.now(),
                type: 'post_switch_send_failed',
                details: {
                    sessionId,
                    attempt: outcome.attempt,
                    code: outcome.event.code ?? 'unknown',
                    stage: outcome.event.stage ?? 'unknown'
                }
            })
            return
        }

        setMessageWindowWarning(sessionId, MESSAGE_WINDOW_POST_SWITCH_NO_REPLY_WARNING_KEY)
        appendRealtimeTrace({
            at: Date.now(),
            type: 'post_switch_no_reply',
            details: {
                sessionId,
                attemptCount: outcome.attemptCount,
                waitMs: Date.now() - createdAt
            }
        })
    } catch (error) {
        clearPendingReply(sessionId)
        setMessageWindowWarning(sessionId, MESSAGE_WINDOW_POST_SWITCH_SEND_FAILED_WARNING_KEY)
        appendRealtimeTrace({
            at: Date.now(),
            type: 'post_switch_send_failed',
            details: {
                sessionId,
                stage: 'catchup_error',
                message: error instanceof Error ? error.message : 'unknown'
            }
        })
    }
}

function clearCurrentPostSwitchWarning(sessionId: string): void {
    const warning = getMessageWindowState(sessionId).warning
    if (!isPostSwitchMessageWindowWarningKey(warning)) {
        return
    }

    clearMessageWindowWarning(sessionId, warning)
}

function findLatestUserMessageCreatedAt(messages: readonly DecryptedMessage[]): number | null {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (message && isUserMessage(message)) {
            return message.createdAt
        }
    }

    return null
}
