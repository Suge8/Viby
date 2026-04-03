import type { LiveSessionConfigSupport } from '@viby/protocol'
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
import type { LoadMoreMessagesResult } from '@/lib/message-window-store'

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
    onSwitchSessionDriver: () => Promise<void>
    isSwitchingSessionDriver: boolean
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
    persistComposerDraft?: boolean
}
