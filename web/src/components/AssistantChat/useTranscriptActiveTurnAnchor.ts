import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import type { TranscriptRenderRow } from '@/chat/transcriptTypes'
import { readTranscriptTopAnchorSpacePx } from './transcriptAnchorGeometry'
import { resolveActiveTurnConversationId } from './transcriptScrollPolicy'

const ACTIVE_TURN_HEADROOM_VAR = '--chat-active-turn-headroom'
const ACTIVE_TURN_HEADROOM_MIN_PX = 64
// Layout-ready retry budget for the first reveal after the active turn id
// flips. The viewport, the `.ds-thread-top-anchor-spacer` Header slot, and the
// row index map are all populated asynchronously after mount; if we reveal
// before any of them are ready, virtuoso scrolls to a stale position and the
// anchor lands wrong. ~30 frames covers ~500ms worst case on slow devices and
// is bounded so we never spin forever.
const ACTIVE_TURN_READY_RETRY_FRAME_BUDGET = 30

// Active turn anchor only fires when the user sends a new message: it pins that
// freshly added user turn to the top header anchor so the user keeps reading
// their own prompt while the assistant streams below. Session entry has a
// separate, simpler contract — it lands at the resting bottom (the newest
// message). There is no `entry-anchored` mode anymore; entry pin = bottom.
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

function clearActiveTurnHeadroom(viewport: HTMLElement | null): void {
    if (!(viewport instanceof HTMLElement)) {
        return
    }
    viewport.style.removeProperty(ACTIVE_TURN_HEADROOM_VAR)
}

function applyActiveTurnHeadroom(viewport: HTMLElement | null): void {
    if (!(viewport instanceof HTMLElement)) {
        return
    }
    const headerSpace = readTranscriptTopAnchorSpacePx(viewport)
    const headroom = Math.max(ACTIVE_TURN_HEADROOM_MIN_PX, viewport.clientHeight - headerSpace)
    viewport.style.setProperty(ACTIVE_TURN_HEADROOM_VAR, `${headroom}px`)
}

type UseTranscriptActiveTurnAnchorOptions = {
    activeTurnLocalId: string | null
    onReleaseActiveTurnAnchor: () => void
    rows: readonly TranscriptRenderRow[]
    revealConversationAtTopAnchor: (conversationId: string) => boolean
    viewportRef: RefObject<HTMLElement | null>
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
        const targetLocalId = options.activeTurnLocalId
        const viewportRef = options.viewportRef
        const revealConversationAtTopAnchor = options.revealConversationAtTopAnchor
        let frame: number | null = null
        let attempt = 0

        const performReveal = () => {
            applyActiveTurnHeadroom(viewportRef.current)
            if (revealConversationAtTopAnchor(conversationId)) {
                setState({ mode: 'anchored', localId: targetLocalId })
            }
        }

        const tryReveal = () => {
            frame = null
            const viewport = viewportRef.current
            // Mount-ready contract: viewport DOM is laid out, the header spacer
            // is measurable (so the top anchor offset is correct), and the row
            // index for this conversation exists in the index map. If any of
            // these are missing, we retry on the next frame instead of issuing
            // a scroll against stale geometry — that mismatch is exactly what
            // made the user's just-sent turn fly off the viewport.
            const layoutReady =
                viewport instanceof HTMLElement &&
                viewport.clientHeight > 0 &&
                readTranscriptTopAnchorSpacePx(viewport) > 0
            if (layoutReady) {
                performReveal()
                return
            }
            attempt += 1
            if (attempt >= ACTIVE_TURN_READY_RETRY_FRAME_BUDGET) {
                // Best-effort fallback: stop spinning and reveal with whatever
                // geometry we have. Worse than waiting one more frame but
                // bounded — better than never revealing at all.
                performReveal()
                return
            }
            frame = requestAnimationFrame(tryReveal)
        }

        tryReveal()
        return () => {
            if (frame !== null) {
                cancelAnimationFrame(frame)
            }
        }
    }, [options.activeTurnLocalId, options.rows, options.revealConversationAtTopAnchor, options.viewportRef])

    useEffect(() => {
        if (options.activeTurnLocalId !== null || state.mode === 'none') {
            return
        }
        setState({ mode: 'none' })
        options.onReleaseActiveTurnAnchor()
    }, [options.activeTurnLocalId, options.onReleaseActiveTurnAnchor, state.mode])

    useEffect(() => {
        if (state.mode === 'anchored') {
            return
        }
        clearActiveTurnHeadroom(options.viewportRef.current)
    }, [state.mode, options.viewportRef])

    useEffect(() => {
        const viewportRef = options.viewportRef
        return () => {
            clearActiveTurnHeadroom(viewportRef.current)
        }
    }, [options.viewportRef])

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
