import { describe, expect, it } from 'bun:test'
import { getActiveSessionTurnState, getPendingRequestsCount, isSessionReadyForInput } from './sessionTurnState'

type TurnStateInput = Parameters<typeof getActiveSessionTurnState>[0]

function turnState(overrides: Partial<TurnStateInput> = {}): TurnStateInput {
    return {
        thinking: false,
        activeAt: null,
        pendingRequestsCount: 0,
        latestActivityAt: null,
        latestActivityKind: null,
        latestCompletedReplyAt: null,
        ...overrides,
    }
}

describe('sessionTurnState', () => {
    it('counts pending requests from the authoritative agent-state owner', () => {
        expect(getPendingRequestsCount(null)).toBe(0)
        expect(getPendingRequestsCount({ requests: undefined })).toBe(0)
        expect(getPendingRequestsCount({ requests: { one: {}, two: {} } })).toBe(2)
    })

    it('keeps processing active while the runtime is thinking', () => {
        expect(
            getActiveSessionTurnState(
                turnState({
                    thinking: true,
                    latestActivityAt: 10,
                    latestActivityKind: 'reply',
                    latestCompletedReplyAt: null,
                })
            )
        ).toBe('processing')
    })

    it('keeps processing while the latest reply has no ready marker', () => {
        expect(
            getActiveSessionTurnState(
                turnState({
                    activeAt: 19,
                    latestActivityAt: 20,
                    latestActivityKind: 'reply',
                    latestCompletedReplyAt: null,
                })
            )
        ).toBe('processing')
    })

    it('does not let a newer idle heartbeat complete an uncompleted reply', () => {
        expect(
            getActiveSessionTurnState(
                turnState({
                    activeAt: 21,
                    latestActivityAt: 20,
                    latestActivityKind: 'reply',
                    latestCompletedReplyAt: null,
                })
            )
        ).toBe('processing')
    })

    it('keeps the card processing after a user turn until reply or ready activity arrives', () => {
        expect(
            getActiveSessionTurnState(
                turnState({
                    latestActivityAt: 30,
                    latestActivityKind: 'user',
                })
            )
        ).toBe('processing')
    })

    it('returns awaiting-input after a completed durable reply once the runtime is idle', () => {
        expect(
            getActiveSessionTurnState(
                turnState({
                    latestActivityAt: 40,
                    latestActivityKind: 'reply',
                    latestCompletedReplyAt: 40,
                })
            )
        ).toBe('awaiting-input')
    })

    it('treats newer completion markers as completed instead of resurrecting processing', () => {
        expect(
            getActiveSessionTurnState(
                turnState({
                    latestActivityAt: 40,
                    latestActivityKind: 'reply',
                    latestCompletedReplyAt: 41,
                })
            )
        ).toBe('awaiting-input')
    })

    it('returns awaiting-input once the running session is ready', () => {
        expect(
            getActiveSessionTurnState(
                turnState({
                    latestActivityAt: 51,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: 50,
                })
            )
        ).toBe('awaiting-input')
    })

    it('only treats a completed reply as ready-for-input', () => {
        expect(
            isSessionReadyForInput({
                ...turnState({ latestActivityKind: 'ready', latestCompletedReplyAt: 50 }),
                active: true,
            })
        ).toBe(true)

        expect(
            isSessionReadyForInput({
                ...turnState({ latestActivityKind: 'ready', latestCompletedReplyAt: null }),
                active: true,
            })
        ).toBe(false)
    })
})
