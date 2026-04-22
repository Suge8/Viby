import { memo, useMemo } from 'react'
import { Virtuoso } from 'react-virtuoso'
import type { ApiClient } from '@/api/client'
import { VibyChatProvider } from '@/components/AssistantChat/context'
import {
    getThreadStageClassName,
    MessageSkeleton,
    THREAD_VIEWPORT_CLASS_NAME,
    ThreadBottomControl,
    ThreadHistoryControl,
    ThreadNotice,
} from '@/components/AssistantChat/threadControls'
import {
    TRANSCRIPT_AT_BOTTOM_THRESHOLD_PX,
    TRANSCRIPT_MIN_OVERSCAN_ITEM_COUNT,
    TRANSCRIPT_OVERSCAN_PX,
} from '@/components/AssistantChat/transcriptScrollPolicy'
import {
    renderThreadTranscriptItem,
    THREAD_VIRTUOSO_COMPONENTS,
    ThreadHeaderSpacer,
    type ThreadVirtuosoContext,
} from '@/components/AssistantChat/transcriptVirtuosoComponents'
import { useTranscriptVirtuoso } from '@/components/AssistantChat/useTranscriptVirtuoso'
import type { SessionChatWorkspaceMessageState } from '@/components/sessionChatWorkspaceTypes'
import { useSessionTranscriptModel } from '@/components/useSessionTranscriptModel'
import type { LoadMoreMessagesResult } from '@/lib/message-window-store'
import type { Session, SessionMetadataSummary } from '@/types/api'

type VibyThreadSessionContext = {
    api: ApiClient
    sessionId: string
    metadata: SessionMetadataSummary | null
    agentState: Session['agentState']
    disabled: boolean
}

type VibyThreadHandlers = {
    onRefresh: () => void
    onRetryMessage?: (localId: string) => void
    onFlushPending: () => void
    onAtBottomChange: (atBottom: boolean) => void
    onLoadHistoryUntilPreviousUser: () => Promise<LoadMoreMessagesResult>
}

type VibyThreadProps = {
    session: VibyThreadSessionContext
    messageState: Pick<
        SessionChatWorkspaceMessageState,
        | 'atBottom'
        | 'hasMore'
        | 'isLoading'
        | 'isLoadingMore'
        | 'messages'
        | 'messagesVersion'
        | 'pendingCount'
        | 'pendingReply'
        | 'stream'
    >
    handlers: VibyThreadHandlers
    composerAnchorTop: number
}

export const VibyThread = memo(function VibyThread(props: VibyThreadProps): React.JSX.Element {
    const threadModel = useVibyThreadModel(props)
    const {
        viewport,
        renderRows,
        rawMessagesCount,
        showSkeleton,
        showNormalizationWarning,
        isHistoryControlDisabled,
        threadStageClassName,
        lastRenderRowId,
    } = threadModel
    const chatProviderValue = useMemo(
        () => ({
            api: props.session.api,
            sessionId: props.session.sessionId,
            metadata: props.session.metadata,
            disabled: props.session.disabled,
            onRefresh: props.handlers.onRefresh,
            onRetryMessage: props.handlers.onRetryMessage,
        }),
        [
            props.handlers.onRefresh,
            props.handlers.onRetryMessage,
            props.session.api,
            props.session.disabled,
            props.session.metadata,
            props.session.sessionId,
        ]
    )

    const virtuosoContext = useMemo<ThreadVirtuosoContext>(
        () => ({
            handleViewportScrollCapture: viewport.handleViewportScrollCapture,
            handleViewportTouchMoveCapture: viewport.handleViewportTouchMoveCapture,
            handleViewportTouchStartCapture: viewport.handleViewportTouchStartCapture,
            handleViewportWheelCapture: viewport.handleViewportWheelCapture,
            setViewportRef: viewport.setViewportRef,
            threadStageClassName,
        }),
        [
            threadStageClassName,
            viewport.handleViewportScrollCapture,
            viewport.handleViewportTouchMoveCapture,
            viewport.handleViewportTouchStartCapture,
            viewport.handleViewportWheelCapture,
            viewport.setViewportRef,
        ]
    )

    return (
        <VibyChatProvider value={chatProviderValue}>
            <div className="session-chat-thread-root flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
                {showNormalizationWarning ? (
                    <div className="px-3 pt-2">
                        <div className="mx-auto w-full ds-stage-shell">
                            <ThreadNotice
                                title={`Message normalization returned 0 items for ${rawMessagesCount} messages (see \`web/src/chat/normalize.ts\`).`}
                                tone="warning"
                            />
                        </div>
                    </div>
                ) : null}

                {!showSkeleton ? (
                    <ThreadHistoryControl
                        visible={viewport.isHistoryControlVisible}
                        loading={viewport.isHistoryActionPending}
                        disabled={isHistoryControlDisabled}
                        onClick={viewport.handleHistoryControlClick}
                    />
                ) : null}

                {showSkeleton ? (
                    <div className={`${THREAD_VIEWPORT_CLASS_NAME} ${threadStageClassName}`}>
                        <div className="ds-thread-lane">
                            <ThreadHeaderSpacer />
                            <MessageSkeleton />
                        </div>
                    </div>
                ) : (
                    <Virtuoso
                        ref={viewport.setVirtuosoRef}
                        data={renderRows}
                        context={virtuosoContext}
                        components={THREAD_VIRTUOSO_COMPONENTS}
                        alignToBottom={viewport.alignToBottom}
                        followOutput={viewport.followOutput}
                        firstItemIndex={viewport.firstItemIndex}
                        initialTopMostItemIndex={viewport.initialTopMostItemIndex}
                        defaultItemHeight={viewport.defaultItemHeight}
                        atBottomThreshold={TRANSCRIPT_AT_BOTTOM_THRESHOLD_PX}
                        atBottomStateChange={viewport.handleAtBottomStateChange}
                        rangeChanged={viewport.handleRangeChanged}
                        totalListHeightChanged={viewport.handleTotalListHeightChanged}
                        overscan={TRANSCRIPT_OVERSCAN_PX}
                        minOverscanItemCount={TRANSCRIPT_MIN_OVERSCAN_ITEM_COUNT}
                        heightEstimates={viewport.heightEstimates}
                        computeItemKey={(_index, item) => item.row.id}
                        itemContent={(_index, item) =>
                            renderThreadTranscriptItem({
                                index: _index,
                                item,
                                lastRowId: lastRenderRowId,
                            })
                        }
                    />
                )}

                <ThreadBottomControl
                    count={props.messageState.pendingCount}
                    visible={!props.messageState.atBottom}
                    onClick={viewport.scrollToBottom}
                />
            </div>
        </VibyChatProvider>
    )
})

function useVibyThreadModel(props: VibyThreadProps) {
    const transcript = useSessionTranscriptModel({
        sessionId: props.session.sessionId,
        messages: props.messageState.messages,
        agentState: props.session.agentState,
        stream: props.messageState.stream,
    })
    const viewport = useTranscriptVirtuoso({
        sessionId: props.session.sessionId,
        rows: transcript.renderRows,
        conversationIds: transcript.conversationIds,
        rowStartIndexByConversationId: transcript.rowStartIndexByConversationId,
        historyJumpTargetConversationIds: transcript.historyJumpTargetConversationIds,
        hasMoreMessages: props.messageState.hasMore,
        isLoadingMessages: props.messageState.isLoading,
        isLoadingMoreMessages: props.messageState.isLoadingMore,
        onLoadHistoryUntilPreviousUser: props.handlers.onLoadHistoryUntilPreviousUser,
        onAtBottomChange: props.handlers.onAtBottomChange,
        onFlushPending: props.handlers.onFlushPending,
        activeTurnLocalId: props.messageState.pendingReply?.localId ?? null,
        composerAnchorTop: props.composerAnchorTop,
    })
    const showSkeleton =
        props.messageState.isLoading && transcript.rawMessagesCount === 0 && props.messageState.pendingCount === 0
    const showNormalizationWarning =
        import.meta.env.DEV && transcript.normalizedMessagesCount === 0 && transcript.rawMessagesCount > 0
    const isHistoryControlDisabled =
        props.messageState.isLoadingMore || viewport.isHistoryActionPending || props.messageState.isLoading
    const lastRenderRowId = transcript.renderRows.at(-1)?.row.id ?? null
    const threadStageClassName = getThreadStageClassName({
        reserveHistoryControlInset: viewport.isHistoryControlVisible,
    })

    return {
        viewport,
        renderRows: transcript.renderRows,
        rawMessagesCount: transcript.rawMessagesCount,
        showSkeleton,
        showNormalizationWarning,
        isHistoryControlDisabled,
        lastRenderRowId,
        threadStageClassName,
    }
}
