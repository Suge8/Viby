import { act, fireEvent, screen } from '@testing-library/react'
import type { FormEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SESSION_COMPOSER_PREFILL_EVENT } from '@/lib/sessionComposerBridge'
import {
    createComposerModel,
    getComposerHarness,
    renderComposer,
    renderComposerWithModel,
} from './VibyComposer.test-support.test'

const harness = getComposerHarness()

describe('VibyComposer behavior', () => {
    it('disables library submitOnEnter so keyboard submission stays under the local controller', () => {
        renderComposer()

        expect(harness.inputProps?.submitOnEnter).toBe(false)
    })

    it('maps the virtual keyboard enter hint to the active platform owner', () => {
        renderComposer()
        expect(harness.inputProps?.enterKeyHint).toBe('send')

        harness.isTouch = true
        renderComposer()
        expect(harness.inputProps?.enterKeyHint).toBe('enter')
    })

    it('prevents hidden form submit so mobile and IME flows cannot bypass the local send controller', () => {
        renderComposer()

        const preventDefault = vi.fn()
        harness.rootProps?.onSubmit?.({ preventDefault } as unknown as FormEvent<HTMLFormElement>)

        expect(preventDefault).toHaveBeenCalledOnce()
        expect(harness.send).not.toHaveBeenCalled()
    })

    it('shows the resume placeholder for closed sessions that can be continued', () => {
        renderComposer({
            configOverrides: {
                active: false,
                allowSendWhenInactive: true,
            },
        })

        expect(harness.inputProps?.placeholder).toMatch(/^(misc\.resumeMessage|Send a message to resume\.\.\.)$/)
    })

    it('accepts an external composer prefill event for the active session', () => {
        renderComposer()

        act(() => {
            window.dispatchEvent(
                new CustomEvent(SESSION_COMPOSER_PREFILL_EVENT, {
                    detail: {
                        sessionId: 'session-1',
                        text: '先对齐目标再开始执行',
                    },
                })
            )
        })

        expect(harness.setText).toHaveBeenCalledWith('先对齐目标再开始执行')
    })

    it('passes the keyboard-aware autocomplete layout through to the suggestions overlay', () => {
        renderComposerWithModel({
            ...createComposerModel(),
            autocompleteLayout: {
                visibleViewportBottomPx: 558,
            },
        })

        expect(harness.lastSuggestionsOverlayProps).toMatchObject({
            autocompleteLayout: {
                visibleViewportBottomPx: 558,
            },
        })
    })

    it('anchors slash suggestions to the input row instead of reusing the controls overlay anchor', async () => {
        renderComposer()

        fireEvent.click(screen.getByText('toggle-controls'))
        await screen.findByTestId('composer-controls-overlay')

        expect(harness.lastSuggestionsOverlayProps?.anchorRef).toBeDefined()
        expect(harness.lastControlsOverlayProps?.anchorRef).toBeDefined()
        expect(harness.lastSuggestionsOverlayProps?.anchorRef).not.toBe(harness.lastControlsOverlayProps?.anchorRef)
    })

    it('shows a readonly-history placeholder for inactive sessions without a resumable marker', () => {
        renderComposer({
            configOverrides: {
                active: false,
                allowSendWhenInactive: false,
            },
        })

        expect(harness.inputProps?.placeholder).toMatch(
            /^(misc\.readonlyHistoryMessage|This older session has no resumable marker\. History is read-only\.\.\.)$/
        )
        expect(harness.inputProps?.disabled).toBe(true)
    })

    it('loads the controls overlay only after the controls button is explicitly opened', async () => {
        renderComposer()

        expect(screen.queryByTestId('composer-controls-overlay')).not.toBeInTheDocument()

        fireEvent.click(screen.getByText('toggle-controls'))

        expect(await screen.findByTestId('composer-controls-overlay')).toBeInTheDocument()
        expect((harness.lastButtonsProps?.controlsButton as { active?: boolean } | null)?.active).toBe(true)
    })

    it('keeps the controls affordance disabled while a same-session switch is pending', () => {
        renderComposer({
            configOverrides: {
                switchTargetDrivers: ['claude'],
                switchDriverPending: true,
            },
        })

        expect(screen.getByText('toggle-controls')).toBeDisabled()
        expect((harness.lastButtonsProps?.controlsButton as { disabled?: boolean } | null)?.disabled).toBe(true)
    })

    it('keeps typing local for inactive resumable sessions until an explicit send path is used', () => {
        renderComposer({
            configOverrides: {
                active: false,
                allowSendWhenInactive: true,
            },
        })

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } })

        expect(harness.handleChange).toHaveBeenCalledTimes(1)
        expect(harness.send).not.toHaveBeenCalled()
    })
})
