import { useCallback, useMemo, useRef, useState } from 'react'
import { getSessionLifecycleState, type LiveSessionConfigSupport } from '@viby/protocol'
import type { VibyComposerModel } from '@/components/AssistantChat/composerTypes'
import type { ApiClient } from '@/api/client'
import type { PendingReplyState } from '@/lib/message-window-store'
import type { MessageWindowWarningKey } from '@/lib/messageWindowWarnings'
import type {
    AttachmentMetadata,
    DecryptedMessage,
    Session,
    SessionStreamState
} from '@/types/api'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import { useChatViewportLayout } from '@/components/AssistantChat/useChatViewportLayout'
import { resolveAssistantReplyingPhase } from '@/components/AssistantChat/assistantReplyingPhase'
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
    warning: MessageWindowWarningKey | null
    hasMore: boolean
    isLoading: boolean
    isLoadingMore: boolean
    isSending: boolean
    pendingCount: number
    messagesVersion: number
    pendingReply: PendingReplyState | null
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
    ensureSessionReady?: () => Promise<void>
    warmSession?: () => void
    isResumingSession?: boolean
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
        pendingReply,
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
        ensureSessionReady,
        warmSession,
        isResumingSession = false,
        autocompleteSuggestions
    } = runtimeOptions

    const sessionId = session.id
    const teamContext = session.teamContext
    const lifecycleState = getSessionLifecycleState(session)
    const sessionInactive = lifecycleState !== 'running'
    const allowSendWhenInactive = sessionInactive
    const memberComposerLocked = teamContext?.sessionRole === 'member' && teamContext.controlOwner !== 'user'
    const [forceScrollToken, setForceScrollToken] = useState(0)
    const {
        isStandalone,
        isKeyboardOpen,
        bottomInsetPx,
        floatingControlBottomInsetPx
    } = useChatViewportLayout()
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
        if (!session.active && (!allowSendWhenInactive || !ensureSessionReady)) {
            return undefined
        }

        return createAttachmentAdapter(api, sessionId, { ensureSessionReady })
    }, [allowSendWhenInactive, api, ensureSessionReady, session.active, sessionId])
    const attachmentsSupported = attachmentAdapter !== undefined
    const replyingPhase = useMemo(() => {
        return resolveAssistantReplyingPhase({
            isResponding: session.thinking,
            pendingReply
        })
    }, [pendingReply, session.thinking])

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
        onSwitchToRemote,
        autocompleteSuggestions,
        attachmentsSupported,
        allowSendWhenInactive,
        isResumingSession
    })

    const { localNotices } = useSessionChatLocalNotices({
        sessionId,
        lifecycleState,
        messagesWarning,
        onUnarchiveSession
    })

    const composerModel = useMemo<VibyComposerModel>(() => ({
        sessionId,
        disabled: isSending || memberComposerLocked,
        onWarmSession: warmSession,
        replyingPhase,
        config: composerConfig,
        handlers: composerHandlers,
        containerRef: composerRef
    }), [
        composerConfig,
        composerHandlers,
        composerRef,
        isSending,
        memberComposerLocked,
        replyingPhase,
        sessionId,
        warmSession
    ])

    const chatLayoutStyle = useMemo<SessionChatLayoutStyle>(() => {
        return buildSessionChatLayoutStyle({
            composerHeight,
            bottomInsetPx,
            floatingControlBottomInsetPx
        })
    }, [
        bottomInsetPx,
        composerHeight,
        floatingControlBottomInsetPx
    ])

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
        streamVersion,
    ])

    return {
        assistantRuntime,
        chatLayoutStyle,
        composerModel,
        composerSurface: memberComposerLocked
            ? { kind: 'read-only-member' as const }
            : { kind: 'full' as const },
        localNotices,
        viewportState: {
            isStandalone,
            isKeyboardOpen
        },
        threadSession,
        threadHandlers,
        threadState
    }
}
