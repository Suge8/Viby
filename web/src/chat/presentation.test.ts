import { describe, expect, it } from 'vitest'
import { getEventPresentation, renderEventLabel } from './presentation'

describe('chat event presentation', () => {
    it('renders driver-switched events with ordered driver names', () => {
        expect(getEventPresentation({
            type: 'driver-switched',
            previousDriver: 'codex',
            targetDriver: 'claude'
        })).toEqual({
            icon: '↔️',
            text: 'Codex changed to Claude',
            tone: 'info'
        })
        expect(renderEventLabel({
            type: 'driver-switched',
            previousDriver: 'codex',
            targetDriver: 'claude'
        })).toBe('Codex changed to Claude')
    })

    it('renders driver-switch send failures with stable non-provider copy', () => {
        expect(getEventPresentation({
            type: 'driver-switch-send-failed',
            stage: 'socket_update',
            code: 'empty_first_turn'
        })).toEqual({
            icon: '⚠️',
            text: 'The first post-switch message was empty and was not sent.',
            tone: 'warning'
        })
        expect(renderEventLabel({
            type: 'driver-switch-send-failed',
            stage: 'callback_flush',
            code: 'unknown'
        })).toBe('The first post-switch message failed before the new agent accepted it.')
    })

    it('falls back to generic copy for malformed driver-switch send failure payloads', () => {
        expect(getEventPresentation({
            type: 'driver-switch-send-failed',
            stage: 123,
            code: null
        } as never)).toEqual({
            icon: '⚠️',
            text: 'The first post-switch message failed before the new agent accepted it.',
            tone: 'warning'
        })
    })
})
