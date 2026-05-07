import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import type { ApiClient } from '@/api/client'
import { ApiError } from '@/api/clientShared'
import { usePlatform } from '@/hooks/usePlatform'
import { makeClientSideId } from '@/lib/messages'
import {
    appendOptimisticMessage,
    clearPendingReply,
    getMessageWindowState,
    markPendingReplyAccepted,
    updateMessageStatus,
} from '@/lib/messageWindowStoreCore'
import { queryKeys } from '@/lib/query-keys'
import { markSessionPendingUserTurnInQueryCache } from '@/lib/sessionQueryCache'
import type { AttachmentMetadata, DecryptedMessage, Session, SessionsResponse } from '@/types/api'

type SendMessageInput = {
    sessionId: string
    text: string
    localId: string
    createdAt: number
    queuedForInvocation: boolean
    attachments?: AttachmentMetadata[]
}

type BlockedReason = 'no-api' | 'no-session' | 'pending'

type UseSendMessageOptions = {
    isSessionThinking?: () => boolean
    onBlocked?: (reason: BlockedReason) => void
    onSendStart?: (info: SendStartInfo) => void
    afterServerAccepted?: (info: ServerAcceptedSendInfo) => Promise<void> | void
    onSendError?: (info: SendErrorInfo) => Promise<void> | void
}

export type SendStartInfo = {
    sessionId: string
    localId: string
    createdAt: number
    attachmentsCount: number
}

type ServerAcceptedSendInfo = {
    sessionId: string
    localId: string
    createdAt: number
    acceptedAt: number
    session: Session
}

export type SendErrorInfo = {
    sessionId: string
    localId: string
    createdAt: number
    error: unknown
}

function findMessageByLocalIdInCollection(
    messages: readonly DecryptedMessage[],
    localId: string
): DecryptedMessage | null {
    return messages.find((message) => message.localId === localId) ?? null
}

function findMessageByLocalId(sessionId: string, localId: string): DecryptedMessage | null {
    const state = getMessageWindowState(sessionId)

    return (
        findMessageByLocalIdInCollection(state.messages, localId) ??
        findMessageByLocalIdInCollection(state.pending, localId)
    )
}

function createOptimisticMessage(input: SendMessageInput): DecryptedMessage {
    return {
        id: input.localId,
        seq: null,
        localId: input.localId,
        content: {
            role: 'user',
            content: {
                type: 'text',
                text: input.text,
                attachments: input.attachments,
            },
        },
        createdAt: input.createdAt,
        invokedAt: input.queuedForInvocation ? null : input.createdAt,
        status: input.queuedForInvocation ? 'queued' : 'sending',
        originalText: input.text,
    }
}

function getOptimisticMessageAttachments(message: DecryptedMessage): AttachmentMetadata[] | undefined {
    const messageEnvelope = message.content
    if (!messageEnvelope || typeof messageEnvelope !== 'object') {
        return undefined
    }
    const role = (messageEnvelope as { role?: unknown }).role
    if (role !== 'user') {
        return undefined
    }
    const userContent = (messageEnvelope as { content?: unknown }).content
    if (!userContent || typeof userContent !== 'object') {
        return undefined
    }
    const attachments = (userContent as { attachments?: unknown }).attachments
    return Array.isArray(attachments) ? (attachments as AttachmentMetadata[]) : undefined
}

export function useSendMessage(
    api: ApiClient | null,
    sessionId: string | null,
    options?: UseSendMessageOptions
): {
    sendMessage: (text: string, attachments?: AttachmentMetadata[]) => void
    retryMessage: (localId: string) => void
    isSending: boolean
} {
    const { haptic } = usePlatform()
    const queryClient = useQueryClient()
    const afterServerAccepted = options?.afterServerAccepted
    const isSessionThinking = options?.isSessionThinking
    const onBlocked = options?.onBlocked
    const onSendError = options?.onSendError
    const onSendStart = options?.onSendStart

    const handleBlocked = useCallback(
        (reason: BlockedReason): void => {
            onBlocked?.(reason)
            if (reason !== 'pending') {
                haptic.notification('error')
            }
        },
        [haptic, onBlocked]
    )

    const mutation = useMutation({
        mutationFn: async (input: SendMessageInput) => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.sendMessage(input.sessionId, input.text, input.localId, input.attachments)
        },
        onMutate: (input) => {
            const previousSessions = queryClient.getQueryData<SessionsResponse>(queryKeys.sessions)
            markSessionPendingUserTurnInQueryCache(queryClient, input.sessionId, input.createdAt)
            return { previousSessions }
        },
        onSuccess: (session, input) => {
            const acceptedAt = Date.now()
            updateMessageStatus(input.sessionId, input.localId, input.queuedForInvocation ? 'queued' : 'sent')
            if (!input.queuedForInvocation) {
                markPendingReplyAccepted(input.sessionId, input.localId, acceptedAt)
            }
            haptic.notification('success')
            void afterServerAccepted?.({
                sessionId: input.sessionId,
                localId: input.localId,
                createdAt: input.createdAt,
                acceptedAt,
                session,
            })
        },
        onError: (error, input, context) => {
            if (error instanceof ApiError) {
                void queryClient.invalidateQueries({ queryKey: queryKeys.session(input.sessionId) })
                void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
            } else if (context?.previousSessions) {
                queryClient.setQueryData(queryKeys.sessions, context.previousSessions)
            }

            updateMessageStatus(input.sessionId, input.localId, 'failed')
            clearPendingReply(input.sessionId, input.localId)
            haptic.notification('error')
            void onSendError?.({
                sessionId: input.sessionId,
                localId: input.localId,
                createdAt: input.createdAt,
                error,
            })
        },
    })

    const getBlockedReason = useCallback((): BlockedReason | null => {
        if (!api) {
            return 'no-api'
        }
        if (!sessionId) {
            return 'no-session'
        }
        if (mutation.isPending) {
            return 'pending'
        }
        return null
    }, [api, mutation.isPending, sessionId])

    const startSendAttempt = useCallback(
        (input: SendMessageInput): void => {
            const sendStartInfo: SendStartInfo = {
                sessionId: input.sessionId,
                localId: input.localId,
                createdAt: input.createdAt,
                attachmentsCount: input.attachments?.length ?? 0,
            }
            onSendStart?.(sendStartInfo)
            mutation.mutate(input)
        },
        [mutation, onSendStart]
    )

    const sendMessage = useCallback(
        (text: string, attachments?: AttachmentMetadata[]) => {
            const blockedReason = getBlockedReason()
            if (blockedReason) {
                handleBlocked(blockedReason)
                return
            }

            const currentSessionId = sessionId
            if (!currentSessionId) {
                return
            }

            const localId = makeClientSideId('local')
            const createdAt = Date.now()
            const optimisticInput: SendMessageInput = {
                sessionId: currentSessionId,
                text,
                localId,
                createdAt,
                queuedForInvocation: isSessionThinking?.() === true,
                attachments,
            }

            appendOptimisticMessage(currentSessionId, createOptimisticMessage(optimisticInput))
            startSendAttempt(optimisticInput)
        },
        [getBlockedReason, handleBlocked, isSessionThinking, sessionId, startSendAttempt]
    )

    const retryMessage = useCallback(
        (localId: string) => {
            const blockedReason = getBlockedReason()
            if (blockedReason) {
                handleBlocked(blockedReason)
                return
            }
            if (!sessionId) {
                return
            }

            const message = findMessageByLocalId(sessionId, localId)
            if (!message?.originalText) return
            const retryInput: SendMessageInput = {
                sessionId,
                text: message.originalText,
                localId,
                createdAt: message.createdAt,
                queuedForInvocation: isSessionThinking?.() === true,
                attachments: getOptimisticMessageAttachments(message),
            }

            updateMessageStatus(sessionId, localId, retryInput.queuedForInvocation ? 'queued' : 'sending')
            startSendAttempt(retryInput)
        },
        [getBlockedReason, handleBlocked, isSessionThinking, sessionId, startSendAttempt]
    )

    return {
        sendMessage,
        retryMessage,
        isSending: mutation.isPending,
    }
}
