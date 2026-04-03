import { memo, useMemo, type ReactNode } from 'react'
import { ThreadPrimitive } from '@assistant-ui/react'
import type { ApiClient } from '@/api/client'
import type { SessionMetadataSummary } from '@/types/api'
import { VibyChatProvider } from '@/components/AssistantChat/context'
import { AppNotice } from '@/components/AppNotice'
import { VibyAssistantMessage } from '@/components/AssistantChat/messages/AssistantMessage'
import { VibySystemMessage } from '@/components/AssistantChat/messages/SystemMessage'
import { VibyUserMessage } from '@/components/AssistantChat/messages/UserMessage'
import { Spinner } from '@/components/Spinner'
import { SkeletonRows } from '@/components/loading/LoadingSkeleton'
import { CHAT_MESSAGE_SKELETON_ROWS } from '@/components/loading/chatSkeletonRows'
import { ArrowDownIcon, ArrowUpIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { type HistoryControlMode, useThreadViewport } from '@/components/AssistantChat/useThreadViewport'
import type { LoadMoreMessagesResult } from '@/lib/message-window-store'
import { joinClassNames } from '@/lib/joinClassNames'
import { useTranslation } from '@/lib/use-translation'

const THREAD_HISTORY_CONTROL_INSET_CLASS_NAME = 'pt-14'
const THREAD_SIDE_CONTROL_BASE_CLASS_NAME = 'session-chat-thread-side-control pointer-events-auto flex h-[var(--chat-side-control-size)] w-[var(--chat-side-control-size)] items-center justify-center rounded-[1rem] p-0 text-center shadow-[0_18px_42px_rgba(9,15,35,0.16)] backdrop-blur-xl transition-[transform,box-shadow,border-color,background-color,color,opacity] duration-[var(--ds-motion-base)] ease-[var(--ds-ease-emphasized)] disabled:cursor-default disabled:opacity-85 md:text-xs'
const THREAD_HISTORY_CONTROL_CLASS_NAME = `${THREAD_SIDE_CONTROL_BASE_CLASS_NAME} session-chat-thread-history-control border-[color:color-mix(in_srgb,var(--ds-border-default)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_90%,transparent)] text-[var(--app-hint)] hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-text-primary)] hover:shadow-[0_14px_30px_rgba(9,15,35,0.12)] md:h-9 md:w-9 md:rounded-full`
const THREAD_SIDE_CONTROL_WRAPPER_CLASS_NAME = 'pointer-events-none fixed inset-0 md:absolute'
const THREAD_HISTORY_CONTROL_WRAPPER_CLASS_NAME = `${THREAD_SIDE_CONTROL_WRAPPER_CLASS_NAME} z-20`
const THREAD_BOTTOM_CONTROL_WRAPPER_CLASS_NAME = `${THREAD_SIDE_CONTROL_WRAPPER_CLASS_NAME} z-30`
const THREAD_SIDE_CONTROL_MOBILE_RIGHT_ANCHOR_CLASS_NAME = 'absolute right-[var(--chat-side-control-right-offset)]'
const THREAD_HISTORY_CONTROL_ANCHOR_CLASS_NAME = `${THREAD_SIDE_CONTROL_MOBILE_RIGHT_ANCHOR_CLASS_NAME} top-[var(--chat-side-control-upper-top)] -translate-y-1/2 md:left-1/2 md:right-auto md:top-2 md:-translate-x-1/2 md:translate-y-0`
const THREAD_BOTTOM_CONTROL_CLASS_NAME = `${THREAD_SIDE_CONTROL_BASE_CLASS_NAME} session-chat-thread-bottom-control border-[color:color-mix(in_srgb,var(--ds-brand)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_92%,transparent)] text-[var(--ds-text-primary)] hover:border-[color:color-mix(in_srgb,var(--ds-brand)_34%,transparent)] hover:shadow-[0_22px_56px_rgba(9,15,35,0.2)] md:h-11 md:w-11 md:rounded-full`
const THREAD_BOTTOM_CONTROL_PENDING_CLASS_NAME = 'border-[color:color-mix(in_srgb,var(--ds-brand)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-brand)_12%,var(--ds-panel-strong)_88%)] text-[var(--ds-brand)]'
const THREAD_BOTTOM_CONTROL_ANCHOR_CLASS_NAME = `session-chat-thread-bottom-control-anchor ${THREAD_SIDE_CONTROL_MOBILE_RIGHT_ANCHOR_CLASS_NAME} bottom-[var(--chat-side-control-rest-bottom-offset)] md:bottom-[var(--chat-bottom-control-bottom-offset)] md:left-1/2 md:right-auto md:top-auto md:-translate-x-1/2`
const THREAD_SIDE_CONTROL_PENDING_DOT_CLASS_NAME = 'absolute -right-0.5 -top-0.5 h-1.75 w-1.75 rounded-full bg-current opacity-85'
const THREAD_SIDE_RAIL_INSET_CLASS_NAME = 'pr-[calc(var(--chat-side-control-gutter)+0.5rem)] md:pr-3'
const THREAD_VIEWPORT_CLASS_NAME = 'session-chat-thread-viewport viby-thread-viewport min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain'
const THREAD_STAGE_CLASS_NAME = 'mx-auto w-full ds-stage-shell min-w-0 p-3'

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

function getThreadStageClassName(options: {
    reserveHistoryControlInset: boolean
    reserveSideRailInset: boolean
}): string {
    return joinClassNames(
        THREAD_STAGE_CLASS_NAME,
        options.reserveHistoryControlInset && THREAD_HISTORY_CONTROL_INSET_CLASS_NAME,
        options.reserveSideRailInset && THREAD_SIDE_RAIL_INSET_CLASS_NAME
    )
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
        <div className={THREAD_BOTTOM_CONTROL_WRAPPER_CLASS_NAME}>
            <div className={THREAD_BOTTOM_CONTROL_ANCHOR_CLASS_NAME}>
                <Button
                    type="button"
                    onClick={props.onClick}
                    aria-label={accessibleLabel}
                    title={accessibleLabel}
                    variant="secondary"
                    className={getThreadBottomControlClassName(hasPendingMessages)}
                >
                    <ArrowDownIcon aria-hidden="true" className="h-4 w-4" />
                    {hasPendingMessages ? <span aria-hidden="true" className={THREAD_SIDE_CONTROL_PENDING_DOT_CLASS_NAME} /> : null}
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
        <div className={THREAD_HISTORY_CONTROL_WRAPPER_CLASS_NAME}>
            <div className={THREAD_HISTORY_CONTROL_ANCHOR_CLASS_NAME}>
                <Button
                    type="button"
                    data-testid="thread-history-control"
                    onClick={(event) => {
                        props.onClick()
                        event.currentTarget.blur()
                    }}
                    disabled={props.disabled}
                    aria-busy={props.loading}
                    aria-label={label}
                    title={label}
                    variant="secondary"
                    className={THREAD_HISTORY_CONTROL_CLASS_NAME}
                >
                    {props.loading ? (
                        <Spinner size="sm" label={null} className="text-current" />
                    ) : (
                        <ArrowUpIcon aria-hidden="true" className="h-4 w-4" />
                    )}
                </Button>
            </div>
        </div>
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
    pinToBottomOnSessionEntry: boolean
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
        pinToBottomOnSessionEntry: props.state.pinToBottomOnSessionEntry,
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
    const shouldReserveSideRailInset = !showSkeleton && (isHistoryControlVisible || !isAtBottom)
    const isHistoryControlDisabled = props.state.isLoadingMoreMessages
        || isHistoryActionPending
        || props.handlers.isLoadingMessages
    const threadStageClassName = getThreadStageClassName({
        reserveHistoryControlInset: shouldReserveHistoryControlInset && !showSkeleton,
        reserveSideRailInset: shouldReserveSideRailInset
    })
    const chatProviderValue = useMemo(() => ({
        api: props.session.api,
        sessionId: props.session.sessionId,
        metadata: props.session.metadata,
        disabled: props.session.disabled,
        onRefresh: props.handlers.onRefresh,
        onRetryMessage: props.handlers.onRetryMessage
    }), [
        props.handlers.onRefresh,
        props.handlers.onRetryMessage,
        props.session.api,
        props.session.disabled,
        props.session.metadata,
        props.session.sessionId
    ])

    return (
        <VibyChatProvider value={chatProviderValue}>
            <ThreadPrimitive.Root className="session-chat-thread-root relative flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
                {!showSkeleton ? (
                    <ThreadHistoryControl
                        mode={historyControlMode}
                        visible={isHistoryControlVisible}
                        loading={isHistoryActionPending}
                        disabled={isHistoryControlDisabled}
                        onClick={handleHistoryControlClick}
                    />
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
                        className={THREAD_VIEWPORT_CLASS_NAME}
                    >
                        <div className={threadStageClassName}>
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
