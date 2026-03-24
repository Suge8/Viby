import { useMutation } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import type { ApiClient } from '@/api/client'
import type { AttachmentMetadata, DecryptedMessage } from '@/types/api'
import { makeClientSideId } from '@/lib/messages'
import {
    appendOptimisticMessage,
    getMessageWindowState,
    updateMessageStatus,
} from '@/lib/message-window-store'
import { usePlatform } from '@/hooks/usePlatform'

type SendMessageInput = {
    sessionId: string
    text: string
    localId: string
    createdAt: number
    attachments?: AttachmentMetadata[]
}

type BlockedReason = 'no-api' | 'no-session' | 'pending'

type UseSendMessageOptions = {
    ensureSessionReady?: () => Promise<void>
    onBlocked?: (reason: BlockedReason) => void
    onSendStart?: (info: {
        sessionId: string
        localId: string
        createdAt: number
        attachmentsCount: number
    }) => void
    afterServerAccepted?: (info: {
        sessionId: string
        localId: string
        createdAt: number
    }) => Promise<void> | void
}

function findMessageByLocalId(
    sessionId: string,
    localId: string,
): DecryptedMessage | null {
    const state = getMessageWindowState(sessionId)
    for (const message of state.messages) {
        if (message.localId === localId) return message
    }
    for (const message of state.pending) {
        if (message.localId === localId) return message
    }
    return null
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
    const [isResolving, setIsResolving] = useState(false)
    const resolveGuardRef = useRef(false)

    const handleBlocked = useCallback((reason: BlockedReason): void => {
        options?.onBlocked?.(reason)
        if (reason !== 'pending') {
            haptic.notification('error')
        }
    }, [haptic, options])

    const ensureSendTargetReady = useCallback(async (): Promise<boolean> => {
        if (!options?.ensureSessionReady) {
            return true
        }

        resolveGuardRef.current = true
        setIsResolving(true)
        try {
            await options.ensureSessionReady()
            return true
        } catch (error) {
            haptic.notification('error')
            console.error('Failed to resolve session before send:', error)
            return false
        } finally {
            resolveGuardRef.current = false
            setIsResolving(false)
        }
    }, [haptic, options])

    const mutation = useMutation({
        mutationFn: async (input: SendMessageInput) => {
            if (!api) {
                throw new Error('API unavailable')
            }
            await api.sendMessage(input.sessionId, input.text, input.localId, input.attachments)
        },
        onMutate: async (input) => {
            const optimisticMessage: DecryptedMessage = {
                id: input.localId,
                seq: null,
                localId: input.localId,
                content: {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: input.text,
                        attachments: input.attachments
                    }
                },
                createdAt: input.createdAt,
                status: 'sending',
                originalText: input.text,
            }

            appendOptimisticMessage(input.sessionId, optimisticMessage)
        },
        onSuccess: (_, input) => {
            updateMessageStatus(input.sessionId, input.localId, 'sent')
            haptic.notification('success')
            void options?.afterServerAccepted?.({
                sessionId: input.sessionId,
                localId: input.localId,
                createdAt: input.createdAt
            })
        },
        onError: (_, input) => {
            updateMessageStatus(input.sessionId, input.localId, 'failed')
            haptic.notification('error')
        },
    })

    const getBlockedReason = useCallback((): BlockedReason | null => {
        if (!api) {
            return 'no-api'
        }
        if (!sessionId) {
            return 'no-session'
        }
        if (mutation.isPending || resolveGuardRef.current) {
            return 'pending'
        }
        return null
    }, [api, mutation.isPending, sessionId])

    const sendMessage = useCallback((text: string, attachments?: AttachmentMetadata[]) => {
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

        void (async () => {
            const ready = await ensureSendTargetReady()
            if (!ready) {
                return
            }

            options?.onSendStart?.({
                sessionId: currentSessionId,
                localId,
                createdAt,
                attachmentsCount: attachments?.length ?? 0
            })
            mutation.mutate({
                sessionId: currentSessionId,
                text,
                localId,
                createdAt,
                attachments,
            })
        })()
    }, [ensureSendTargetReady, getBlockedReason, handleBlocked, mutation, options, sessionId])

    const retryMessage = useCallback((localId: string) => {
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

        updateMessageStatus(sessionId, localId, 'sending')

        mutation.mutate({
            sessionId,
            text: message.originalText,
            localId,
            createdAt: message.createdAt,
        })
    }, [getBlockedReason, handleBlocked, mutation, sessionId])

    return {
        sendMessage,
        retryMessage,
        isSending: mutation.isPending || isResolving,
    }
}
