import type { LiveSessionConfigSupport, SameSessionSwitchTargetDriver } from '@viby/protocol'
import type { ReactNode } from 'react'
import type { ApiClient } from '@/api/client'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import type { LoadMoreMessagesResult, PendingReplyState } from '@/lib/message-window-store'
import type { MessageWindowWarningKey } from '@/lib/messageWindowWarnings'
import type { AttachmentMetadata, DecryptedMessage, Session, SessionStreamState } from '@/types/api'

export type SessionChatWorkspaceMessageState = {
    messages: DecryptedMessage[]
    warning: MessageWindowWarningKey | null
    hasMore: boolean
    isLoading: boolean
    isLoadingMore: boolean
    isSending: boolean
    pendingCount: number
    atBottom: boolean
    messagesVersion: number
    pendingReply: PendingReplyState | null
    stream: SessionStreamState | null
    streamVersion: number
}

export type SessionChatWorkspaceActionHandlers = {
    onRefresh: () => void
    onLoadHistoryUntilPreviousUser: () => Promise<LoadMoreMessagesResult>
    onSend: (text: string, attachments?: AttachmentMetadata[]) => void
    onFlushPending: () => void
    onAtBottomChange: (atBottom: boolean) => void
    onRetryMessage?: (localId: string) => void
    onAbort: () => Promise<void>
    onSwitchSessionDriver: (targetDriver: SameSessionSwitchTargetDriver) => Promise<void>
    isSwitchingSessionDriver: boolean
}

export type SessionChatWorkspaceRuntimeOptions = {
    liveConfigSupport: LiveSessionConfigSupport
    autocompleteLayout?: {
        visibleViewportBottomPx: number
    }
    autocompleteSuggestions?: (query: string) => Promise<Suggestion[]>
    autocompleteRefreshKey?: number
    onSuggestionAction?: (suggestion: Suggestion) => void
}

export type SessionChatWorkspaceProps = {
    api: ApiClient
    session: Session
    messageState: SessionChatWorkspaceMessageState
    actions: SessionChatWorkspaceActionHandlers
    runtimeOptions: SessionChatWorkspaceRuntimeOptions
    persistComposerDraft?: boolean
}

export type SessionChatComposerSurfaceModel = {
    api: ApiClient
    session: Session
    runtimeOptions: SessionChatWorkspaceRuntimeOptions
    isSending: boolean
    pendingReply: PendingReplyState | null
    onSwitchSessionDriver: (targetDriver: SameSessionSwitchTargetDriver) => Promise<void>
    isSwitchingSessionDriver: boolean
    allowSendWhenInactive: boolean
    attachmentsSupported: boolean
    disabled: boolean
}

export type SessionChatComposerSurfaceProps = {
    model: SessionChatComposerSurfaceModel
}

export type SessionChatRuntimeSurfaceModel = {
    api: ApiClient
    session: Session
    composerAnchorTop: number
    composerHeight: number
    messageState: SessionChatWorkspaceMessageState
    onAbort: () => Promise<void>
    onAtBottomChange: (atBottom: boolean) => void
    onFlushPending: () => void
    onLoadHistoryUntilPreviousUser: () => Promise<LoadMoreMessagesResult>
    onRefresh: () => void
    onRetryMessage?: (localId: string) => void
    onSend: (text: string, attachments?: AttachmentMetadata[]) => void
    allowSendWhenInactive: boolean
}

export type SessionChatRuntimeSurfaceProps = {
    model: SessionChatRuntimeSurfaceModel
    persistComposerDraft?: boolean
    children?: ReactNode
}
