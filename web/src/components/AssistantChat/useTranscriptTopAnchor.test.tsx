import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TRANSCRIPT_ROW_TEST_ID } from '@/lib/sessionUiContracts'
import { useTranscriptTopAnchor } from './useTranscriptTopAnchor'

function createViewportWithTarget(): HTMLDivElement {
    const viewport = document.createElement('div')
    Object.defineProperty(viewport, 'onscrollend', { configurable: true, value: null, writable: true })
    Object.defineProperty(viewport, 'scrollTop', { configurable: true, value: 40, writable: true })
    viewport.getBoundingClientRect = () => ({ top: 0, bottom: 400 }) as DOMRect
    viewport.scrollTo = vi.fn()

    const row = document.createElement('div')
    row.dataset.conversationId = 'conversation-1'
    row.dataset.historyJumpTarget = 'true'
    row.dataset.testid = TRANSCRIPT_ROW_TEST_ID
    row.getBoundingClientRect = () => ({ top: 100, bottom: 160 }) as DOMRect
    viewport.appendChild(row)
    return viewport
}

describe('useTranscriptTopAnchor', () => {
    it('settles top-anchor via scrollend and writes only through the virtuoso handle', () => {
        const viewport = createViewportWithTarget()
        const scrollTo = vi.fn()
        const scrollToIndex = vi.fn()
        const { result } = renderHook(() =>
            useTranscriptTopAnchor({
                rowStartIndexByConversationId: new Map([['conversation-1', 3]]),
                viewportRef: { current: viewport },
                virtuosoRef: {
                    current: {
                        scrollTo,
                        scrollToIndex,
                    } as never,
                },
            })
        )

        act(() => {
            expect(result.current.revealConversationAtTopAnchor('conversation-1')).toBe(true)
        })
        expect(scrollToIndex).toHaveBeenCalledWith({ index: 3, align: 'start', behavior: 'smooth', offset: 0 })

        act(() => {
            viewport.dispatchEvent(new Event('scrollend'))
        })

        expect(scrollTo).toHaveBeenCalledWith({ top: 140, behavior: 'auto' })
        expect(viewport.scrollTo).not.toHaveBeenCalled()
    })
})
