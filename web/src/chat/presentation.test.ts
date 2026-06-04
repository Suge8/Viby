import { describe, expect, it } from 'vitest'
import { getEventPresentation, renderEventLabel } from './presentation'

describe('chat event presentation', () => {
    it('renders assistant errors without raw technical text in the primary copy', () => {
        const presentation = getEventPresentation({
            type: 'assistant-error',
            detail: 'WebSocket closed with code 1006',
        })

        expect(presentation).toEqual({
            icon: '⚠️',
            text: 'AI reply did not complete. Send again to retry.',
            tone: 'danger',
            detail: 'WebSocket closed with code 1006',
        })
        expect(renderEventLabel({ type: 'assistant-error', detail: 'WebSocket closed with code 1006' })).not.toContain(
            'WebSocket'
        )
    })

    it('does not stringify unknown event payloads into the transcript', () => {
        expect(
            getEventPresentation({
                type: 'vendor-event',
                payload: { secret: 'hidden' },
            } as never)
        ).toEqual({
            icon: null,
            text: 'Session event: vendor-event',
            tone: 'default',
        })
    })

    it('renders API retry events as user-facing AI service states', () => {
        expect(
            getEventPresentation({
                type: 'api-error',
                retryAttempt: 1,
                maxRetries: 3,
                error: 'WebSocket closed with code 1006',
            })
        ).toEqual({
            icon: '⏳',
            text: 'AI service problem. Retrying (1/3)',
            tone: 'warning',
            detail: 'WebSocket closed with code 1006',
        })
    })

    it('renders driver-switched events with compact target-first copy', () => {
        expect(
            getEventPresentation({
                type: 'driver-switched',
                previousDriver: 'copilot',
                targetDriver: 'claude',
            })
        ).toEqual({
            icon: '↔️',
            text: 'Switched to Claude',
            tone: 'info',
        })
        expect(
            renderEventLabel({
                type: 'driver-switched',
                previousDriver: 'copilot',
                targetDriver: 'claude',
            })
        ).toBe('Switched to Claude')
        expect(
            renderEventLabel({
                type: 'driver-switched',
                targetDriver: 'copilot',
            })
        ).toBe('Switched to Copilot')
    })

    it('renders driver-switch send failures with stable non-provider copy', () => {
        expect(
            getEventPresentation({
                type: 'driver-switch-send-failed',
                stage: 'runtime_update',
                code: 'empty_first_turn',
            })
        ).toEqual({
            icon: '⚠️',
            text: 'The first post-switch message was empty and was not sent.',
            tone: 'warning',
        })
        expect(
            renderEventLabel({
                type: 'driver-switch-send-failed',
                stage: 'callback_flush',
                code: 'unknown',
            })
        ).toBe('The first post-switch message failed before the new agent accepted it.')
    })

    it('falls back to generic copy for malformed driver-switch send failure payloads', () => {
        expect(
            getEventPresentation({
                type: 'driver-switch-send-failed',
                stage: 123,
                code: null,
            } as never)
        ).toEqual({
            icon: '⚠️',
            text: 'The first post-switch message failed before the new agent accepted it.',
            tone: 'warning',
        })
    })

    it('renders turn terminal statuses with stable user-facing copy', () => {
        expect(
            getEventPresentation({
                type: 'turn-terminal',
                status: 'truncated',
                provider: 'pi',
                reason: 'length',
            })
        ).toEqual({
            icon: '↪️',
            text: 'Reply reached the model output limit.',
            tone: 'warning',
        })
        expect(getEventPresentation({ type: 'turn-terminal', status: 'completed' })).toEqual({
            icon: null,
            text: 'Reply finished.',
            tone: 'default',
        })
        expect(getEventPresentation({ type: 'turn-terminal', status: 'aborted' })).toEqual({
            icon: '⏹️',
            text: 'Reply stopped.',
            tone: 'info',
        })
        expect(getEventPresentation({ type: 'turn-terminal', status: 'needs-input' })).toEqual({
            icon: '💬',
            text: 'Reply needs your input.',
            tone: 'info',
        })
        expect(getEventPresentation({ type: 'turn-terminal', status: 'failed', reason: 'length' })).toEqual({
            icon: '⚠️',
            text: 'AI reply did not complete. Send again to retry.',
            tone: 'danger',
            detail: 'length',
        })
    })

    it('renders usage limit warning events', () => {
        expect(
            getEventPresentation({
                type: 'limit-warning',
                endsAt: 1774278000,
                percent: 90,
                limitType: 'five_hour',
            })
        ).toMatchObject({
            icon: '⏳',
            tone: 'warning',
        })
        expect(
            renderEventLabel({
                type: 'limit-warning',
                endsAt: 1774278000,
                percent: 90,
            })
        ).toContain('Usage limit warning (90%)')
    })
})
