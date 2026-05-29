import { type MutableRefObject, type RefObject, useCallback } from 'react'
import type { TranscriptRenderRow } from '@/chat/transcriptTypes'
import type { TranscriptFollowMode } from './transcriptScrollPolicy'
import { useTranscriptActiveTurnAnchor } from './useTranscriptActiveTurnAnchor'

type UseTranscriptActiveTurnControllerOptions = {
    activeTurnLocalId: string | null
    cancelTopAnchorTransaction: () => void
    measuredAtBottomRef: MutableRefObject<boolean>
    revealConversationAtManualTop: (conversationId: string, markNotAtBottom?: boolean) => boolean
    rows: readonly TranscriptRenderRow[]
    setFollowMode: (nextMode: TranscriptFollowMode) => void
    startExplicitBottomTransaction: (behavior: 'auto' | 'smooth') => void
    viewportRef: RefObject<HTMLElement | null>
}

export function useTranscriptActiveTurnController(options: UseTranscriptActiveTurnControllerOptions): {
    activeTurnAnchor: ReturnType<typeof useTranscriptActiveTurnAnchor>
    scrollToConversation: (conversationId: string) => boolean
} {
    const {
        activeTurnLocalId,
        cancelTopAnchorTransaction,
        measuredAtBottomRef,
        revealConversationAtManualTop,
        rows,
        setFollowMode,
        startExplicitBottomTransaction,
        viewportRef,
    } = options
    const revealActiveTurnAtTopAnchor = useCallback(
        (conversationId: string) => revealConversationAtManualTop(conversationId, false),
        [revealConversationAtManualTop]
    )
    const handleActiveTurnAnchorRelease = useCallback(() => {
        if (!measuredAtBottomRef.current) {
            setFollowMode('manual')
            return
        }
        cancelTopAnchorTransaction()
        startExplicitBottomTransaction('auto')
    }, [cancelTopAnchorTransaction, measuredAtBottomRef, setFollowMode, startExplicitBottomTransaction])
    const activeTurnAnchor = useTranscriptActiveTurnAnchor({
        activeTurnLocalId,
        onReleaseActiveTurnAnchor: handleActiveTurnAnchorRelease,
        rows,
        revealConversationAtTopAnchor: revealActiveTurnAtTopAnchor,
        viewportRef,
    })
    const scrollToConversation = useCallback(
        (conversationId: string) => {
            activeTurnAnchor.clearActiveTurnAnchor()
            return revealConversationAtManualTop(conversationId)
        },
        [activeTurnAnchor.clearActiveTurnAnchor, revealConversationAtManualTop]
    )

    return {
        activeTurnAnchor,
        scrollToConversation,
    }
}
