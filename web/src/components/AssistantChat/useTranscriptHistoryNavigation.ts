import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import type { LoadMoreMessagesResult } from '@/lib/message-window-store'
import { resolvePreviousUserConversationId } from './transcriptScrollPolicy'
import {
    resolveVisibleTranscriptConversationId,
    resolveVisibleTranscriptHistoryJumpTargetConversationId,
} from './transcriptVisibleRows'

export function useTranscriptHistoryNavigation(options: {
    conversationIds: readonly string[]
    fallbackConversationId: string | null
    hasMoreMessages: boolean
    historyJumpTargetConversationIds: readonly string[]
    isScrollNavigationPending: boolean
    isScrollNavigationPendingRef: () => boolean
    isLoadingMessages: boolean
    isLoadingMoreMessages: boolean
    onLoadHistoryUntilPreviousUser: () => Promise<LoadMoreMessagesResult>
    scrollToConversation: (conversationId: string) => boolean
    viewportRef: RefObject<HTMLDivElement | null>
}) {
    const pendingHistoryReferenceConversationIdRef = useRef<string | null>(null)
    const [isHistoryActionPending, setIsHistoryActionPending] = useState(false)

    useEffect(() => {
        if (!pendingHistoryReferenceConversationIdRef.current) {
            return
        }

        const targetConversationId = resolvePreviousUserConversationId({
            conversationIds: options.conversationIds,
            historyJumpTargetConversationIds: options.historyJumpTargetConversationIds,
            referenceConversationId: pendingHistoryReferenceConversationIdRef.current,
        })

        if (targetConversationId && options.scrollToConversation(targetConversationId)) {
            pendingHistoryReferenceConversationIdRef.current = null
            setIsHistoryActionPending(false)
            return
        }

        if (!options.hasMoreMessages && !options.isLoadingMoreMessages) {
            pendingHistoryReferenceConversationIdRef.current = null
            setIsHistoryActionPending(false)
        }
    }, [
        options.conversationIds,
        options.hasMoreMessages,
        options.historyJumpTargetConversationIds,
        options.isLoadingMoreMessages,
        options.scrollToConversation,
    ])

    const handleHistoryControlClick = useCallback(async () => {
        if (
            isHistoryActionPending ||
            options.isScrollNavigationPendingRef() ||
            options.isLoadingMessages ||
            options.isLoadingMoreMessages
        ) {
            return
        }

        const referenceConversationId =
            resolveVisibleTranscriptHistoryJumpTargetConversationId({
                viewport: options.viewportRef.current,
            }) ??
            resolveVisibleTranscriptConversationId({
                viewport: options.viewportRef.current,
            }) ??
            options.fallbackConversationId ??
            options.conversationIds[0] ??
            null
        const targetConversationId = resolvePreviousUserConversationId({
            conversationIds: options.conversationIds,
            historyJumpTargetConversationIds: options.historyJumpTargetConversationIds,
            referenceConversationId,
        })

        if (targetConversationId && options.scrollToConversation(targetConversationId)) {
            return
        }

        if (!options.hasMoreMessages) {
            return
        }

        pendingHistoryReferenceConversationIdRef.current = referenceConversationId
        setIsHistoryActionPending(true)
        try {
            const loadResult = await options.onLoadHistoryUntilPreviousUser()
            if (!loadResult.didLoadOlderMessages) {
                pendingHistoryReferenceConversationIdRef.current = null
                setIsHistoryActionPending(false)
            }
        } catch {
            pendingHistoryReferenceConversationIdRef.current = null
            setIsHistoryActionPending(false)
        }
    }, [
        isHistoryActionPending,
        options.conversationIds,
        options.fallbackConversationId,
        options.hasMoreMessages,
        options.historyJumpTargetConversationIds,
        options.isScrollNavigationPending,
        options.isScrollNavigationPendingRef,
        options.isLoadingMessages,
        options.isLoadingMoreMessages,
        options.onLoadHistoryUntilPreviousUser,
        options.scrollToConversation,
        options.viewportRef,
    ])

    const isHistoryControlVisible =
        resolvePreviousUserConversationId({
            conversationIds: options.conversationIds,
            historyJumpTargetConversationIds: options.historyJumpTargetConversationIds,
            referenceConversationId:
                options.fallbackConversationId ?? options.conversationIds[options.conversationIds.length - 1] ?? null,
        }) !== null || options.hasMoreMessages

    return {
        isHistoryActionPending: isHistoryActionPending || options.isScrollNavigationPending,
        isHistoryControlVisible,
        handleHistoryControlClick,
    }
}
