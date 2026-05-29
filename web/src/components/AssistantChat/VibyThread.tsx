import { memo, useEffect, useMemo, useState } from 'react'
import { Virtuoso } from 'react-virtuoso'
import type { ApiClient } from '@/api/client'
import type { AssistantReplyingPhase } from '@/components/AssistantChat/assistantReplyingPhase'
import { ConversationOutline } from '@/components/AssistantChat/ConversationOutline'
import { VibyChatProvider } from '@/components/AssistantChat/context'
import {
    MessageSkeleton,
    THREAD_STAGE_CLASS_NAME,
    THREAD_VIEWPORT_CLASS_NAME,
    ThreadBottomControl,
    ThreadHistoryLoadingIndicator,
    ThreadNotice,
} from '@/components/AssistantChat/threadControls'
import {
    TRANSCRIPT_AT_BOTTOM_THRESHOLD_PX,
    TRANSCRIPT_MIN_OVERSCAN_ITEM_COUNT,
    TRANSCRIPT_OVERSCAN_PX,
    TRANSCRIPT_START_REACHED_THRESHOLD_PX,
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
import { isQueuedForInvocation } from '@/lib/messages'
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
    onSend: (text: string) => void
    onFlushPending: () => void
    onAtBottomChange: (atBottom: boolean) => void
    onLoadHistoryUntilPreviousUser: () => Promise<LoadMoreMessagesResult>
}

type VibyThreadProps = {
    session: VibyThreadSessionContext
    messageState: Pick<
        SessionChatWorkspaceMessageState,
        | 'atBottom'
        | 'hasLoadedLatest'
        | 'hasMore'
        | 'isLoadingMore'
        | 'messages'
        | 'messagesVersion'
        | 'pendingCount'
        | 'pendingReply'
        | 'restoredFromWarmSnapshot'
        | 'stream'
    >
    handlers: VibyThreadHandlers
    composerAnchorTop: number
    replyingPhase: AssistantReplyingPhase | null
}

// Skeleton must crossfade with the real transcript rather than swap instantly.
// Instant swap produces a one-frame blank gap on session entry; the crossfade
// keeps the loading affordance visible while the rows fade in underneath, so
// the user perceives a single, smooth entry transition.
const SKELETON_FADE_OUT_MS = 220

export const VibyThread = memo(function VibyThread(props: VibyThreadProps): React.JSX.Element {
    const threadModel = useVibyThreadModel(props)
    const {
        viewport,
        outlineItems,
        renderRows,
        rawMessagesCount,
        showSkeleton,
        showNormalizationWarning,
        lastRenderRowId,
        freshRowIds,
    } = threadModel
    const skeletonMounted = useSkeletonExitTransition(showSkeleton, SKELETON_FADE_OUT_MS)
    const chatProviderValue = useMemo(
        () => ({
            api: props.session.api,
            sessionId: props.session.sessionId,
            metadata: props.session.metadata,
            disabled: props.session.disabled,
            onRefresh: props.handlers.onRefresh,
            onRetryMessage: props.handlers.onRetryMessage,
            onSend: props.handlers.onSend,
        }),
        [
            props.handlers.onRefresh,
            props.handlers.onRetryMessage,
            props.handlers.onSend,
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
            threadStageClassName: THREAD_STAGE_CLASS_NAME,
        }),
        [
            viewport.handleViewportScrollCapture,
            viewport.handleViewportTouchMoveCapture,
            viewport.handleViewportTouchStartCapture,
            viewport.handleViewportWheelCapture,
            viewport.setViewportRef,
        ]
    )

    return (
        <VibyChatProvider value={chatProviderValue}>
            <div className="session-chat-thread-root relative flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
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

                {showSkeleton ? null : (
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
                        totalListHeightChanged={viewport.handleTotalListHeightChanged}
                        startReached={viewport.handleStartReached}
                        rangeChanged={viewport.handleRangeChanged}
                        increaseViewportBy={{
                            top: TRANSCRIPT_START_REACHED_THRESHOLD_PX,
                            bottom: 0,
                        }}
                        overscan={TRANSCRIPT_OVERSCAN_PX}
                        minOverscanItemCount={TRANSCRIPT_MIN_OVERSCAN_ITEM_COUNT}
                        heightEstimates={viewport.heightEstimates}
                        computeItemKey={(_index, item) => item.row.id}
                        itemContent={(_index, item) =>
                            renderThreadTranscriptItem({
                                index: _index,
                                item,
                                lastRowId: lastRenderRowId,
                                freshRowIds,
                            })
                        }
                    />
                )}

                {skeletonMounted ? (
                    <div
                        className={`${THREAD_VIEWPORT_CLASS_NAME} ${THREAD_STAGE_CLASS_NAME} ds-thread-skeleton-overlay`}
                        data-fading={showSkeleton ? undefined : 'true'}
                        aria-hidden={showSkeleton ? undefined : 'true'}
                    >
                        <div className="ds-thread-lane">
                            <ThreadHeaderSpacer />
                            <MessageSkeleton />
                        </div>
                    </div>
                ) : null}

                <ThreadHistoryLoadingIndicator
                    visible={props.messageState.isLoadingMore && props.messageState.hasMore}
                />

                <ConversationOutline
                    sessionId={props.session.sessionId}
                    items={outlineItems}
                    onJump={viewport.scrollToConversation}
                    hasMoreHistory={props.messageState.hasMore}
                    isLoadingHistory={props.messageState.isLoadingMore}
                    isPreparingHistory={
                        props.messageState.restoredFromWarmSnapshot || !props.messageState.hasLoadedLatest
                    }
                    onRequestMoreHistory={() => {
                        // Fire-and-forget; the underlying loader is already
                        // single-flighted by `useTranscriptStartReachedOwner`
                        // and the message-window store.
                        void props.handlers.onLoadHistoryUntilPreviousUser()
                    }}
                />

                <ThreadBottomControl
                    count={props.messageState.pendingCount}
                    visible={!props.messageState.atBottom}
                    onClick={viewport.scrollToBottom}
                />
            </div>
        </VibyChatProvider>
    )
})

/**
 * Keeps the loading skeleton mounted briefly after `showSkeleton` flips false
 * so it can fade out while the real transcript fades in underneath. Re-entering
 * the loading state mid-transition (rare, e.g. session switch) immediately
 * remounts the skeleton with no fade.
 */
function useSkeletonExitTransition(showSkeleton: boolean, durationMs: number): boolean {
    const [mounted, setMounted] = useState(showSkeleton)
    useEffect(() => {
        if (showSkeleton) {
            setMounted(true)
            return
        }
        const timer = window.setTimeout(() => setMounted(false), durationMs)
        return () => {
            window.clearTimeout(timer)
        }
    }, [showSkeleton, durationMs])
    return mounted
}

function useVibyThreadModel(props: VibyThreadProps) {
    const visibleMessages = useMemo(
        () => props.messageState.messages.filter((message) => !isQueuedForInvocation(message)),
        [props.messageState.messages]
    )
    const transcript = useSessionTranscriptModel({
        sessionId: props.session.sessionId,
        messages: visibleMessages,
        agentState: props.session.agentState,
        stream: props.messageState.stream,
        replyingPhase: props.replyingPhase,
    })
    const viewport = useTranscriptVirtuoso({
        sessionId: props.session.sessionId,
        rows: transcript.renderRows,
        rowStartIndexByConversationId: transcript.rowStartIndexByConversationId,
        onAtBottomChange: props.handlers.onAtBottomChange,
        onFlushPending: props.handlers.onFlushPending,
        activeTurnLocalId: props.messageState.pendingReply?.localId ?? null,
        composerAnchorTop: props.composerAnchorTop,
        hasMoreHistory: props.messageState.hasMore,
        onLoadOlderHistory: props.handlers.onLoadHistoryUntilPreviousUser,
    })
    const showSkeleton = props.messageState.restoredFromWarmSnapshot || !props.messageState.hasLoadedLatest
    const showNormalizationWarning =
        import.meta.env.DEV && transcript.normalizedMessagesCount === 0 && transcript.rawMessagesCount > 0
    const lastRenderRowId = transcript.renderRows.at(-1)?.row.id ?? null

    return {
        viewport,
        outlineItems: transcript.outlineItems ?? [],
        renderRows: transcript.renderRows,
        freshRowIds: transcript.freshRowIds,
        rawMessagesCount: transcript.rawMessagesCount,
        showSkeleton,
        showNormalizationWarning,
        lastRenderRowId,
    }
}
