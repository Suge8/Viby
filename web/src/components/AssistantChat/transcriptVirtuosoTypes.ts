import type { RefObject } from 'react'
import type { ListRange, VirtuosoHandle } from 'react-virtuoso'
import type { TranscriptRenderRow } from '@/chat/transcriptTypes'
import { buildTranscriptFollowOutput } from './transcriptScrollPolicy'

export type UseTranscriptVirtuosoOptions = {
    sessionId: string
    rows: readonly TranscriptRenderRow[]
    rowStartIndexByConversationId: ReadonlyMap<string, number>
    onAtBottomChange: (atBottom: boolean) => void
    onFlushPending: () => void
    activeTurnLocalId: string | null
    composerAnchorTop: number
    /** Whether older history is still available beyond the current window. */
    hasMoreHistory: boolean
    /**
     * Called when the viewport approaches the top of the loaded window. The
     * transcript owner single-flights concurrent calls so the underlying loader
     * only ever runs one batch at a time; this signature accepts any Promise
     * shape so the caller can pass `loadHistoryUntilPreviousUser` directly
     * without an extra wrapper.
     */
    onLoadOlderHistory: () => Promise<unknown> | void
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
    handleAtBottomStateChange: (atBottom: boolean) => void
    handleTotalListHeightChanged: () => void
    handleStartReached: () => void
    handleRangeChanged: (range: ListRange) => void
    handleViewportScrollCapture: () => void
    handleViewportWheelCapture: (event: Pick<WheelEvent, 'deltaY'>) => void
    handleViewportTouchStartCapture: (event: Pick<TouchEvent, 'touches'>) => void
    handleViewportTouchMoveCapture: (event: Pick<TouchEvent, 'touches'>) => void
    scrollToBottom: () => void
    scrollToConversation: (conversationId: string) => boolean
}
