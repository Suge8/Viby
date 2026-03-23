import { useCallback, useMemo, useRef, useState } from 'react'
import { getSessionLifecycleState, type LiveSessionConfigSupport } from '@viby/protocol'
import type { VibyComposerModel } from '@/components/AssistantChat/composerTypes'
import type { ApiClient } from '@/api/client'
import type {
    AttachmentMetadata,
    DecryptedMessage,
    Session,
    SessionStreamState
} from '@/types/api'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import { useChatViewportLayout } from '@/components/AssistantChat/useChatViewportLayout'
import { useVibyRuntime } from '@/lib/assistant-runtime'
import { createAttachmentAdapter } from '@/lib/attachmentAdapter'
import type { LoadMoreMessagesResult } from '@/lib/message-window-store'
import { useElementHeight } from '@/hooks/useElementHeight'
import { useSessionChatBlocks } from '@/components/useSessionChatBlocks'
import { useSessionChatLocalNotices } from '@/components/useSessionChatLocalNotices'
import { useSessionLiveConfigControls } from '@/components/useSessionLiveConfigControls'
import {
    buildSessionChatLayoutStyle,
    type SessionChatLayoutStyle
} from '@/components/sessionChatLayoutStyle'

export type SessionChatWorkspaceMessageState = {
    messages: DecryptedMessage[]
    warning: string | null
    hasMore: boolean
    isLoading: boolean
    isLoadingMore: boolean
    isSending: boolean
    pendingCount: number
    messagesVersion: number
    stream: SessionStreamState | null
    streamVersion: number
}

export type SessionChatWorkspaceActionHandlers = {
    onRefresh: () => void
    onLoadMore: () => Promise<LoadMoreMessagesResult>
    onLoadHistoryUntilPreviousUser: () => Promise<LoadMoreMessagesResult>
    onSend: (text: string, attachments?: AttachmentMetadata[]) => void
    onFlushPending: () => void
    onAtBottomChange: (atBottom: boolean) => void
    onRetryMessage?: (localId: string) => void
    onAbort: () => Promise<void>
    onUnarchiveSession: () => Promise<void>
    onSwitchToRemote: () => Promise<void>
}

export type SessionChatWorkspaceRuntimeOptions = {
    liveConfigSupport: LiveSessionConfigSupport
    resolveSessionId?: (currentSessionId: string) => Promise<string>
    autocompleteSuggestions?: (query: string) => Promise<Suggestion[]>
}

export type SessionChatWorkspaceProps = {
    api: ApiClient
    session: Session
    messageState: SessionChatWorkspaceMessageState
    actions: SessionChatWorkspaceActionHandlers
    runtimeOptions: SessionChatWorkspaceRuntimeOptions
}

export function useSessionChatWorkspaceModel(props: SessionChatWorkspaceProps) {
    const { api, session } = props
    const { actions, messageState, runtimeOptions } = props
    const {
        messages,
        warning: messagesWarning,
        hasMore,
        isLoading,
        isLoadingMore,
        isSending,
        pendingCount,
        messagesVersion,
        stream,
        streamVersion
    } = messageState
    const {
        onRefresh,
        onLoadMore,
        onLoadHistoryUntilPreviousUser,
        onSend,
        onFlushPending,
        onAtBottomChange,
        onRetryMessage,
        onAbort,
        onUnarchiveSession,
        onSwitchToRemote
    } = actions
    const {
        liveConfigSupport,
        resolveSessionId,
        autocompleteSuggestions
    } = runtimeOptions

    const sessionId = session.id
    const lifecycleState = getSessionLifecycleState(session)
    const sessionInactive = lifecycleState !== 'running'
    const allowSendWhenInactive = lifecycleState === 'closed'
    const [forceScrollToken, setForceScrollToken] = useState(0)
    const viewportLayout = useChatViewportLayout()
    const composerRef = useRef<HTMLDivElement | null>(null)
    const composerHeight = useElementHeight(composerRef)
    const chatBlocks = useSessionChatBlocks({
        sessionId,
        messages,
        agentState: session.agentState,
        stream
    })

    const handleSend = useCallback((text: string, attachments?: AttachmentMetadata[]) => {
        onSend(text, attachments)
        setForceScrollToken((token) => token + 1)
    }, [onSend])

    const attachmentAdapter = useMemo(() => {
        if (!session.active && (!allowSendWhenInactive || !resolveSessionId)) {
            return undefined
        }

        return createAttachmentAdapter(api, sessionId, { resolveSessionId })
    }, [allowSendWhenInactive, api, resolveSessionId, session.active, sessionId])

    const assistantRuntime = useVibyRuntime({
        session,
        blocks: chatBlocks.blocks,
        isSending,
        onSendMessage: handleSend,
        onAbort,
        attachmentAdapter,
        allowSendWhenInactive
    })

    const {
        composerConfig,
        composerHandlers
    } = useSessionLiveConfigControls({
        api,
        session,
        liveConfigSupport,
        onRefresh,
        onSwitchToRemote,
        autocompleteSuggestions,
        attachmentsSupported: attachmentAdapter !== undefined,
        allowSendWhenInactive
    })

    const { localNotices } = useSessionChatLocalNotices({
        sessionId,
        lifecycleState,
        messagesWarning,
        onUnarchiveSession
    })

    const composerModel = useMemo<VibyComposerModel>(() => ({
        sessionId,
        disabled: isSending,
        config: composerConfig,
        handlers: composerHandlers,
        containerRef: composerRef
    }), [composerConfig, composerHandlers, composerRef, isSending, sessionId])

    const chatLayoutStyle = useMemo<SessionChatLayoutStyle>(() => {
        return buildSessionChatLayoutStyle({
            composerHeight,
            bottomInsetPx: viewportLayout.bottomInsetPx
        })
    }, [composerHeight, viewportLayout.bottomInsetPx])

    const threadSession = useMemo(() => ({
        api,
        sessionId,
        metadata: session.metadata,
        disabled: sessionInactive,
    }), [api, session.metadata, sessionId, sessionInactive])

    const threadHandlers = useMemo(() => ({
        onRefresh,
        onRetryMessage,
        onFlushPending,
        onAtBottomChange,
        isLoadingMessages: isLoading,
        onLoadHistoryUntilPreviousUser,
        onLoadMore,
    }), [
        isLoading,
        onAtBottomChange,
        onFlushPending,
        onLoadHistoryUntilPreviousUser,
        onLoadMore,
        onRefresh,
        onRetryMessage
    ])

    const threadState = useMemo(() => ({
        hasMoreMessages: hasMore,
        isLoadingMoreMessages: isLoadingMore,
        isResponding: session.thinking,
        hasStreamingResponse: chatBlocks.hasStreamingResponse,
        pendingCount,
        rawMessagesCount: chatBlocks.rawMessagesCount,
        normalizedMessagesCount: chatBlocks.normalizedMessagesCount,
        messagesVersion,
        streamVersion,
        threadMessageIds: chatBlocks.threadMessageIds,
        conversationMessageIds: chatBlocks.conversationMessageIds,
        threadMessageOwnerById: chatBlocks.threadMessageOwnerById,
        historyJumpTargetMessageIds: chatBlocks.historyJumpTargetMessageIds,
        forceScrollToken,
    }), [
        chatBlocks.conversationMessageIds,
        chatBlocks.hasStreamingResponse,
        chatBlocks.historyJumpTargetMessageIds,
        chatBlocks.normalizedMessagesCount,
        chatBlocks.rawMessagesCount,
        chatBlocks.threadMessageIds,
        chatBlocks.threadMessageOwnerById,
        forceScrollToken,
        hasMore,
        isLoadingMore,
        messagesVersion,
        pendingCount,
        session.thinking,
        streamVersion,
    ])

    return {
        assistantRuntime,
        chatLayoutStyle,
        composerModel,
        localNotices,
        viewportState: {
            isStandalone: viewportLayout.isStandalone,
            isKeyboardOpen: viewportLayout.isKeyboardOpen
        },
        threadSession,
        threadHandlers,
        threadState
    }
}
