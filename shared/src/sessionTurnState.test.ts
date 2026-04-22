import { describe, expect, it } from 'bun:test'
import { getActiveSessionTurnState, getPendingRequestsCount, isSessionReadyForInput } from './sessionTurnState'

describe('sessionTurnState', () => {
    it('counts pending requests from the authoritative agent-state owner', () => {
        expect(getPendingRequestsCount(null)).toBe(0)
        expect(getPendingRequestsCount({ requests: undefined })).toBe(0)
        expect(getPendingRequestsCount({ requests: { one: {}, two: {} } })).toBe(2)
    })

    it('keeps processing active while the turn is still running', () => {
        expect(
            getActiveSessionTurnState({
                thinking: true,
                pendingRequestsCount: 0,
                latestActivityKind: 'reply',
            })
        ).toBe('processing')
    })

    it('keeps processing ahead of awaiting-input while a reply is still streaming', () => {
        expect(
            getActiveSessionTurnState({
                thinking: true,
                pendingRequestsCount: 1,
                latestActivityKind: 'reply',
            })
        ).toBe('processing')
    })

    it('returns awaiting-input once the running session is idle', () => {
        expect(
            getActiveSessionTurnState({
                thinking: false,
                pendingRequestsCount: 0,
                latestActivityKind: 'ready',
            })
        ).toBe('awaiting-input')
    })

    it('only treats a completed reply as ready-for-input', () => {
        expect(
            isSessionReadyForInput({
                active: true,
                thinking: false,
                pendingRequestsCount: 0,
                latestActivityKind: 'ready',
            })
        ).toBe(true)

        expect(
            isSessionReadyForInput({
                active: true,
                thinking: false,
                pendingRequestsCount: 0,
                latestActivityKind: null,
            })
        ).toBe(false)
    })
})
