import { memo, type ReactNode } from 'react'
import { ThreadPrimitive } from '@assistant-ui/react'
import type { ApiClient } from '@/api/client'
import type { SessionMetadataSummary } from '@/types/api'
import { AssistantReplyingIndicator } from '@/components/AssistantChat/AssistantReplyingIndicator'
import { VibyChatProvider } from '@/components/AssistantChat/context'
import { AppNotice } from '@/components/AppNotice'
import { VibyAssistantMessage } from '@/components/AssistantChat/messages/AssistantMessage'
import { VibySystemMessage } from '@/components/AssistantChat/messages/SystemMessage'
import { VibyUserMessage } from '@/components/AssistantChat/messages/UserMessage'
import { Spinner } from '@/components/Spinner'
import { SkeletonRows } from '@/components/loading/LoadingSkeleton'
import { CHAT_MESSAGE_SKELETON_ROWS } from '@/components/loading/chatSkeletonRows'
import { ArrowDownIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { type HistoryControlMode, useThreadViewport } from '@/components/AssistantChat/useThreadViewport'
import type { LoadMoreMessagesResult } from '@/lib/message-window-store'
import { useTranslation } from '@/lib/use-translation'

const THREAD_HISTORY_CONTROL_INSET_CLASS_NAME = 'pt-14'
const THREAD_HISTORY_CONTROL_CLASS_NAME = 'pointer-events-auto min-h-9 gap-2 rounded-full border-[color:color-mix(in_srgb,var(--ds-border-default)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_90%,transparent)] px-3.5 py-2 text-xs font-medium text-[var(--app-hint)] shadow-[0_10px_24px_rgba(9,15,35,0.08)] backdrop-blur-xl hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-text-primary)] hover:shadow-[0_14px_30px_rgba(9,15,35,0.12)] disabled:cursor-default disabled:opacity-85'
const THREAD_BOTTOM_CONTROL_WRAPPER_CLASS_NAME = 'pointer-events-none absolute inset-x-0 z-30 px-3'
const THREAD_BOTTOM_CONTROL_STAGE_CLASS_NAME = 'mx-auto flex w-full ds-stage-shell justify-center'
const THREAD_BOTTOM_CONTROL_CLASS_NAME = 'rounded-full border-[color:color-mix(in_srgb,var(--ds-brand)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_92%,transparent)] text-[var(--ds-text-primary)] shadow-[0_18px_48px_rgba(9,15,35,0.16)] backdrop-blur-xl hover:border-[color:color-mix(in_srgb,var(--ds-brand)_34%,transparent)] hover:shadow-[0_22px_56px_rgba(9,15,35,0.2)]'
const THREAD_BOTTOM_CONTROL_PENDING_CLASS_NAME = 'border-[color:color-mix(in_srgb,var(--ds-brand)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-brand)_12%,var(--ds-panel-strong)_88%)] text-[var(--ds-brand)]'
const THREAD_BOTTOM_CONTROL_BOTTOM_OFFSET = 'var(--chat-bottom-control-bottom-offset)'

function getHistoryControlLabel(options: {
    loading: boolean
    mode: HistoryControlMode
    t: (key: string) => string
}): string {
    if (options.loading) {
        return options.t('misc.loading')
    }

    switch (options.mode) {
        case 'jump-previous-user':
            return options.t('misc.previousUserMessage')
        case 'load-more':
            return options.t('misc.moreMessages')
    }
}

function getThreadBottomControlAccessibleLabel(options: {
    count: number
    t: (key: string, params?: Record<string, string | number>) => string
}): string {
    if (options.count > 0) {
        return options.t('misc.newMessage', { n: options.count })
    }

    return options.t('misc.backToBottom')
}

function getThreadBottomControlClassName(hasPendingMessages: boolean): string {
    if (hasPendingMessages) {
        return `${THREAD_BOTTOM_CONTROL_CLASS_NAME} ${THREAD_BOTTOM_CONTROL_PENDING_CLASS_NAME}`
    }

    return THREAD_BOTTOM_CONTROL_CLASS_NAME
}

function ThreadBottomControl(props: {
    count: number
    visible: boolean
    onClick: () => void
}): React.JSX.Element | null {
    const { t } = useTranslation()
    if (!props.visible) {
        return null
    }

    const accessibleLabel = getThreadBottomControlAccessibleLabel({
        count: props.count,
        t
    })
    const hasPendingMessages = props.count > 0

    return (
        <div
            className={THREAD_BOTTOM_CONTROL_WRAPPER_CLASS_NAME}
            style={{ bottom: THREAD_BOTTOM_CONTROL_BOTTOM_OFFSET }}
        >
            <div className={THREAD_BOTTOM_CONTROL_STAGE_CLASS_NAME}>
                <Button
                    type="button"
                    onClick={props.onClick}
                    aria-label={accessibleLabel}
                    title={accessibleLabel}
                    variant="secondary"
                    size="icon"
                    className={`pointer-events-auto ${getThreadBottomControlClassName(hasPendingMessages)}`}
                >
                    <ArrowDownIcon aria-hidden="true" className="h-4 w-4" />
                </Button>
            </div>
        </div>
    )
}

function ThreadHistoryControl(props: {
    mode: HistoryControlMode
    visible: boolean
    loading: boolean
    disabled: boolean
    onClick: () => void
}): React.JSX.Element | null {
    const { t } = useTranslation()

    if (!props.visible) {
        return null
    }

    const label = getHistoryControlLabel({
        loading: props.loading,
        mode: props.mode,
        t,
    })

    return (
        <Button
            type="button"
            data-testid="thread-history-control"
            onClick={(event) => {
                props.onClick()
                event.currentTarget.blur()
            }}
            disabled={props.disabled}
            aria-busy={props.loading}
            variant="secondary"
            size="sm"
            className={THREAD_HISTORY_CONTROL_CLASS_NAME}
        >
            {props.loading ? <Spinner size="sm" label={null} className="text-current" /> : <span aria-hidden="true">↑</span>}
            <span>{label}</span>
        </Button>
    )
}

function MessageSkeleton(): React.JSX.Element {
    const { t } = useTranslation()

    return (
        <SkeletonRows
            label={t('misc.loadingMessages')}
            rows={CHAT_MESSAGE_SKELETON_ROWS}
        />
    )
}

function ThreadNotice(props: { title: string; tone?: 'default' | 'warning' }): ReactNode {
    return (
        <AppNotice
            layout="inline"
            tone={props.tone}
            title={props.title}
            className="mx-auto max-w-[min(100%,32rem)]"
        />
    )
}

const THREAD_MESSAGE_COMPONENTS = {
    UserMessage: VibyUserMessage,
    AssistantMessage: VibyAssistantMessage,
    SystemMessage: VibySystemMessage
} as const

type VibyThreadSessionContext = {
    api: ApiClient
    sessionId: string
    metadata: SessionMetadataSummary | null
    disabled: boolean
}

type VibyThreadHandlers = {
    onRefresh: () => void
    onRetryMessage?: (localId: string) => void
    onFlushPending: () => void
    onAtBottomChange: (atBottom: boolean) => void
    isLoadingMessages: boolean
    onLoadHistoryUntilPreviousUser: () => Promise<LoadMoreMessagesResult>
    onLoadMore: () => Promise<LoadMoreMessagesResult>
}

type VibyThreadState = {
    hasMoreMessages: boolean
    isLoadingMoreMessages: boolean
    isResponding: boolean
    hasStreamingResponse: boolean
    pendingCount: number
    rawMessagesCount: number
    normalizedMessagesCount: number
    messagesVersion: number
    streamVersion: number
    threadMessageIds: readonly string[]
    conversationMessageIds: readonly string[]
    threadMessageOwnerById: ReadonlyMap<string, string>
    historyJumpTargetMessageIds: readonly string[]
    forceScrollToken: number
}

type VibyThreadProps = {
    session: VibyThreadSessionContext
    handlers: VibyThreadHandlers
    state: VibyThreadState
}

export const VibyThread = memo(function VibyThread(props: VibyThreadProps): React.JSX.Element {
    const {
        viewportRef,
        historyControlMode,
        isHistoryControlVisible,
        shouldReserveHistoryControlInset,
        isHistoryActionPending,
        isAtBottom,
        scrollToBottom,
        handleHistoryControlClick
    } = useThreadViewport({
        sessionId: props.session.sessionId,
        hasMoreMessages: props.state.hasMoreMessages,
        isLoadingMessages: props.handlers.isLoadingMessages,
        isLoadingMoreMessages: props.state.isLoadingMoreMessages,
        onLoadHistoryUntilPreviousUser: props.handlers.onLoadHistoryUntilPreviousUser,
        onLoadMore: props.handlers.onLoadMore,
        onAtBottomChange: props.handlers.onAtBottomChange,
        onFlushPending: props.handlers.onFlushPending,
        messagesVersion: props.state.messagesVersion,
        streamVersion: props.state.streamVersion,
        orderedMessageIds: props.state.threadMessageIds,
        conversationMessageIds: props.state.conversationMessageIds,
        threadMessageOwnerById: props.state.threadMessageOwnerById,
        historyJumpTargetMessageIds: props.state.historyJumpTargetMessageIds,
        forceScrollToken: props.state.forceScrollToken,
    })

    const showSkeleton = props.handlers.isLoadingMessages
        && props.state.rawMessagesCount === 0
        && props.state.pendingCount === 0
    const showNormalizationWarning = import.meta.env.DEV
        && props.state.normalizedMessagesCount === 0
        && props.state.rawMessagesCount > 0
    const showReplyingIndicator = props.state.isResponding && !props.state.hasStreamingResponse

    return (
        <VibyChatProvider value={{
            api: props.session.api,
            sessionId: props.session.sessionId,
            metadata: props.session.metadata,
            disabled: props.session.disabled,
            onRefresh: props.handlers.onRefresh,
            onRetryMessage: props.handlers.onRetryMessage
        }}>
            <ThreadPrimitive.Root className="session-chat-thread-root relative flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
                {!showSkeleton ? (
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center px-2 pt-2">
                        <ThreadHistoryControl
                            mode={historyControlMode}
                            visible={isHistoryControlVisible}
                            loading={isHistoryActionPending}
                            disabled={props.state.isLoadingMoreMessages || isHistoryActionPending || props.handlers.isLoadingMessages}
                            onClick={handleHistoryControlClick}
                        />
                    </div>
                ) : null}
                <ThreadPrimitive.Viewport
                    asChild
                    autoScroll={false}
                    scrollToBottomOnRunStart={false}
                    scrollToBottomOnInitialize={false}
                    scrollToBottomOnThreadSwitch={false}
                >
                    <div
                        ref={viewportRef}
                        className="session-chat-thread-viewport viby-thread-viewport min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain"
                    >
                        <div className={`mx-auto w-full ds-stage-shell min-w-0 p-3 ${shouldReserveHistoryControlInset && !showSkeleton ? THREAD_HISTORY_CONTROL_INSET_CLASS_NAME : ''}`}>
                            <div className="ds-thread-lane">
                                {showSkeleton ? <MessageSkeleton /> : null}
                                {!showSkeleton && showNormalizationWarning ? (
                                    <div className="mb-2">
                                        <ThreadNotice
                                            title={`Message normalization returned 0 items for ${props.state.rawMessagesCount} messages (see \`web/src/chat/normalize.ts\`).`}
                                            tone="warning"
                                        />
                                    </div>
                                ) : null}
                                <div
                                    className="viby-thread-messages flex min-w-0 w-full flex-col gap-3"
                                    data-viby-measure-all={isHistoryActionPending ? 'true' : 'false'}
                                >
                                    <ThreadPrimitive.Messages components={THREAD_MESSAGE_COMPONENTS} />
                                    {showReplyingIndicator ? <AssistantReplyingIndicator /> : null}
                                </div>
                            </div>
                        </div>
                    </div>
                </ThreadPrimitive.Viewport>
                <ThreadBottomControl
                    count={props.state.pendingCount}
                    visible={!isAtBottom}
                    onClick={scrollToBottom}
                />
            </ThreadPrimitive.Root>
        </VibyChatProvider>
    )
})
