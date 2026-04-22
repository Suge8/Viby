import { useCallback, useEffect, useRef, useState } from 'react'
import type { TranscriptRenderRow } from '@/chat/transcriptTypes'
import { resolveActiveTurnConversationId } from './transcriptScrollPolicy'

type ActiveTurnAnchorState =
    | { mode: 'none' }
    | { localId: string; mode: 'anchored' }
    | { localId: string; mode: 'bottom-override' }

function resolveAlignToBottom(state: ActiveTurnAnchorState, activeTurnLocalId: string | null): boolean {
    if (state.mode === 'none') {
        return activeTurnLocalId === null
    }
    if (state.mode === 'anchored') {
        return false
    }

    return activeTurnLocalId === null || state.localId === activeTurnLocalId
}

type UseTranscriptActiveTurnAnchorOptions = {
    activeTurnLocalId: string | null
    rows: readonly TranscriptRenderRow[]
    revealConversationAtTopAnchor: (conversationId: string) => boolean
}

export function useTranscriptActiveTurnAnchor(options: UseTranscriptActiveTurnAnchorOptions): {
    alignToBottom: boolean
    clearActiveTurnAnchor: () => void
    overrideActiveTurnWithBottom: () => void
} {
    const anchoredLocalIdRef = useRef<string | null>(null)
    const [state, setState] = useState<ActiveTurnAnchorState>({ mode: 'none' })

    useEffect(() => {
        const conversationId = resolveActiveTurnConversationId(options.rows, options.activeTurnLocalId)
        if (!options.activeTurnLocalId || !conversationId || anchoredLocalIdRef.current === options.activeTurnLocalId) {
            return
        }

        anchoredLocalIdRef.current = options.activeTurnLocalId
        if (options.revealConversationAtTopAnchor(conversationId)) {
            setState({ mode: 'anchored', localId: options.activeTurnLocalId })
        }
    }, [options.activeTurnLocalId, options.rows, options.revealConversationAtTopAnchor])

    const clearActiveTurnAnchor = useCallback(() => {
        setState({ mode: 'none' })
    }, [])

    const overrideActiveTurnWithBottom = useCallback(() => {
        if (!options.activeTurnLocalId) {
            setState({ mode: 'none' })
            return
        }

        setState({ mode: 'bottom-override', localId: options.activeTurnLocalId })
    }, [options.activeTurnLocalId])

    const alignToBottom = resolveAlignToBottom(state, options.activeTurnLocalId)

    return {
        alignToBottom,
        clearActiveTurnAnchor,
        overrideActiveTurnWithBottom,
    }
}
