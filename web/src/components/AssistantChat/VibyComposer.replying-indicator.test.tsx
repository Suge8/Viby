import { act, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { REPLYING_INDICATOR_EXIT_DURATION_MS } from '@/components/AssistantChat/useReplyingIndicatorPresence'
import { createComposerModel, createComposerNode, renderComposer } from './VibyComposer.test-support.test'

describe('VibyComposer replying indicator', () => {
    it('renders a minimal replying indicator above the composer surface when the session is replying', () => {
        const { container } = renderComposer({
            replyingPhase: 'replying',
        })

        const indicator = screen.getByTestId('assistant-replying-indicator')
        const surface = container.querySelector('.ds-composer-surface')

        expect(
            screen.getByRole('status', { name: /^(AI is replying|assistant\.responding\.title)$/ })
        ).toBeInTheDocument()
        expect(indicator).toHaveClass('ds-replying-indicator')
        expect(indicator.textContent).toBe('')
        expect(indicator.parentElement?.parentElement).toHaveClass('ds-replying-indicator-anchor')
        expect(indicator.compareDocumentPosition(surface as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('keeps the replying indicator mounted briefly for a smooth fade-out after replying finishes', () => {
        vi.useFakeTimers()

        const { rerender } = renderComposer({
            replyingPhase: 'replying',
        })

        rerender(createComposerNode(createComposerModel()))

        expect(screen.getByTestId('assistant-replying-indicator').parentElement).toHaveAttribute(
            'data-state',
            'exiting'
        )

        act(() => {
            vi.advanceTimersByTime(REPLYING_INDICATOR_EXIT_DURATION_MS)
        })

        expect(screen.queryByTestId('assistant-replying-indicator')).not.toBeInTheDocument()
    })
})
