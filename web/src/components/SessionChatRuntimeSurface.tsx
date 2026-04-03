import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { Suspense, lazy, memo, useEffect, useMemo, useState } from 'react'
import type { AttachmentAdapter } from '@assistant-ui/react'
import { VibyThread } from '@/components/AssistantChat/VibyThread'
import { useSessionChatBlocks } from '@/components/useSessionChatBlocks'
import { useVibyRuntime } from '@/lib/assistant-runtime'
import type {
    SessionChatWorkspaceActionHandlers,
    SessionChatWorkspaceMessageState
} from '@/components/sessionChatWorkspaceTypes'
import type { ApiClient } from '@/api/client'
import type { Session } from '@/types/api'

let composerDraftControllerModulePromise: Promise<{ default: typeof import('@/components/AssistantChat/ComposerDraftController').ComposerDraftController }> | null = null

function loadComposerDraftControllerModule() {
    composerDraftControllerModulePromise ??= import('@/components/AssistantChat/ComposerDraftController').then((module) => ({
        default: module.ComposerDraftController
    }))
    return composerDraftControllerModulePromise
}

const LazyComposerDraftController = lazy(loadComposerDraftControllerModule)

type SessionChatRuntimeSurfaceProps = {
    workspace: Pick<{
        api: ApiClient
        session: Session
        messageState: SessionChatWorkspaceMessageState
    }, 'api' | 'session' | 'messageState'>
    runtime: {
        actions: Pick<
            SessionChatWorkspaceActionHandlers,
            | 'onAbort'
            | 'onAtBottomChange'
            | 'onFlushPending'
            | 'onLoadHistoryUntilPreviousUser'
            | 'onLoadMore'
            | 'onRefresh'
            | 'onRetryMessage'
            | 'onSend'
        >
        allowSendWhenInactive: boolean
        forceScrollToken: number
    }
    persistComposerDraft?: boolean
    children?: React.ReactNode
}

function SessionChatRuntimeSurfaceInner(props: SessionChatRuntimeSurfaceProps): React.JSX.Element {
    const {
        workspace: { api, session, messageState },
        runtime: { actions, allowSendWhenInactive, forceScrollToken },
        persistComposerDraft = true,
        children
    } = props
    const attachmentAdapter = useLazyAttachmentAdapter({
        api,
        sessionId: session.id,
        enabled: session.active || allowSendWhenInactive
    })

    const chatBlocks = useSessionChatBlocks({
        sessionId: session.id,
        messages: messageState.messages,
        agentState: session.agentState,
        stream: messageState.stream
    })

    const assistantRuntime = useVibyRuntime({
        session,
        blocks: chatBlocks.blocks,
        isSending: messageState.isSending,
        onSendMessage: actions.onSend,
        onAbort: actions.onAbort,
        attachmentAdapter,
        allowSendWhenInactive
    })

    const threadSession = useMemo(() => ({
        api,
        sessionId: session.id,
        metadata: session.metadata,
        disabled: !session.active
    }), [api, session.active, session.id, session.metadata])

    const threadHandlers = useMemo(() => ({
        onRefresh: actions.onRefresh,
        onRetryMessage: actions.onRetryMessage,
        onFlushPending: actions.onFlushPending,
        onAtBottomChange: actions.onAtBottomChange,
        isLoadingMessages: messageState.isLoading,
        onLoadHistoryUntilPreviousUser: actions.onLoadHistoryUntilPreviousUser,
        onLoadMore: actions.onLoadMore,
    }), [
        actions.onAtBottomChange,
        actions.onFlushPending,
        actions.onLoadHistoryUntilPreviousUser,
        actions.onLoadMore,
        actions.onRefresh,
        actions.onRetryMessage,
        messageState.isLoading
    ])

    const threadState = useMemo(() => ({
        hasMoreMessages: messageState.hasMore,
        isLoadingMoreMessages: messageState.isLoadingMore,
        // Chat entry should always land on the latest message, even for inactive sessions.
        pinToBottomOnSessionEntry: true,
        pendingCount: messageState.pendingCount,
        rawMessagesCount: chatBlocks.rawMessagesCount,
        normalizedMessagesCount: chatBlocks.normalizedMessagesCount,
        messagesVersion: messageState.messagesVersion,
        streamVersion: messageState.streamVersion,
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
        messageState.hasMore,
        messageState.isLoadingMore,
        messageState.messagesVersion,
        messageState.pendingCount,
        messageState.streamVersion,
    ])

    return (
        <AssistantRuntimeProvider runtime={assistantRuntime}>
            {persistComposerDraft ? (
                <Suspense fallback={null}>
                    <LazyComposerDraftController sessionId={session.id} />
                </Suspense>
            ) : null}
            <VibyThread
                key={session.id}
                session={threadSession}
                handlers={threadHandlers}
                state={threadState}
            />
            {children}
        </AssistantRuntimeProvider>
    )
}

export const SessionChatRuntimeSurface = memo(SessionChatRuntimeSurfaceInner)

function useLazyAttachmentAdapter(options: {
    api: ApiClient
    sessionId: string
    enabled: boolean
}): AttachmentAdapter | undefined {
    const { api, sessionId, enabled } = options
    const [attachmentAdapter, setAttachmentAdapter] = useState<AttachmentAdapter>()

    useEffect(() => {
        if (!enabled) {
            setAttachmentAdapter(undefined)
            return
        }

        let cancelled = false
        void import('@/lib/attachmentAdapter').then((module) => {
            if (cancelled) {
                return
            }

            setAttachmentAdapter(module.createAttachmentAdapter(api, sessionId))
        })

        return () => {
            cancelled = true
        }
    }, [api, enabled, sessionId])

    return attachmentAdapter
}
