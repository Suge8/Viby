import type { RefObject } from 'react'
import type { ListRange, VirtuosoHandle } from 'react-virtuoso'
import type { TranscriptRenderRow } from '@/chat/transcriptTypes'
import type { LoadMoreMessagesResult } from '@/lib/message-window-store'
import { buildTranscriptFollowOutput } from './transcriptScrollPolicy'

export type UseTranscriptVirtuosoOptions = {
    sessionId: string
    rows: readonly TranscriptRenderRow[]
    conversationIds: readonly string[]
    rowStartIndexByConversationId: ReadonlyMap<string, number>
    historyJumpTargetConversationIds: readonly string[]
    hasMoreMessages: boolean
    isLoadingMessages: boolean
    isLoadingMoreMessages: boolean
    onLoadHistoryUntilPreviousUser: () => Promise<LoadMoreMessagesResult>
    onAtBottomChange: (atBottom: boolean) => void
    onFlushPending: () => void
    activeTurnLocalId: string | null
    composerAnchorTop: number
}

export type UseTranscriptVirtuosoResult = {
    setViewportRef: (viewport: HTMLDivElement | null) => void
    setVirtuosoRef: (handle: VirtuosoHandle | null) => void
    viewportRef: RefObject<HTMLDivElement | null>
    virtuosoRef: RefObject<VirtuosoHandle | null>
    firstItemIndex: number
    initialTopMostItemIndex: { align: 'end'; index: number } | undefined
    alignToBottom: boolean
    defaultItemHeight: number | undefined
    followOutput: ReturnType<typeof buildTranscriptFollowOutput>
    heightEstimates: number[]
    isHistoryActionPending: boolean
    isHistoryControlVisible: boolean
    handleHistoryControlClick: () => void
    handleRangeChanged: (range: ListRange) => void
    handleAtBottomStateChange: (atBottom: boolean) => void
    handleTotalListHeightChanged: () => void
    handleViewportScrollCapture: () => void
    handleViewportWheelCapture: (event: Pick<WheelEvent, 'deltaY'>) => void
    handleViewportTouchStartCapture: (event: Pick<TouchEvent, 'touches'>) => void
    handleViewportTouchMoveCapture: (event: Pick<TouchEvent, 'touches'>) => void
    scrollToBottom: () => void
}
