import { describe, expect, it } from 'bun:test'
import {
    createEmptySessionMessageActivity,
    getSessionActivityKind,
    mergeSessionMessageActivity,
    shouldMessageAdvanceSessionUpdatedAt,
} from './sessionActivity'

describe('sessionActivity', () => {
    it('keeps hidden agent meta outputs out of activity classification', () => {
        const content = {
            role: 'agent',
            content: {
                type: 'output',
                data: {
                    type: 'summary',
                    summary: 'Recovered title',
                    isMeta: true,
                },
            },
        }

        expect(getSessionActivityKind(content)).toBeNull()
        expect(shouldMessageAdvanceSessionUpdatedAt(getSessionActivityKind(content))).toBe(false)
    })

    it('does not advance merged session activity for hidden agent meta outputs', () => {
        const current = createEmptySessionMessageActivity()
        const next = mergeSessionMessageActivity(current, {
            createdAt: 1_000,
            content: {
                role: 'agent',
                content: {
                    type: 'output',
                    data: {
                        type: 'summary',
                        summary: 'Recovered title',
                        isMeta: true,
                    },
                },
            },
        })

        expect(next).toBe(current)
    })

    it('keeps driver-switch send failure events out of activity classification', () => {
        const content = {
            role: 'agent',
            content: {
                type: 'event',
                data: {
                    type: 'driver-switch-send-failed',
                    stage: 'socket_update',
                    code: 'empty_first_turn',
                },
            },
        }

        expect(getSessionActivityKind(content)).toBeNull()
        expect(shouldMessageAdvanceSessionUpdatedAt(getSessionActivityKind(content))).toBe(false)
    })

    it('does not advance merged session activity for driver-switch send failure events', () => {
        const current = createEmptySessionMessageActivity()
        const next = mergeSessionMessageActivity(current, {
            createdAt: 1_000,
            content: {
                role: 'agent',
                content: {
                    type: 'event',
                    data: {
                        type: 'driver-switch-send-failed',
                        stage: 'callback_flush',
                        code: 'unknown',
                    },
                },
            },
        })

        expect(next).toBe(current)
    })
})
