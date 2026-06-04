import { describe, expect, it } from 'vitest'
import { registerCodexNotificationHandler } from './codexRemoteRuntime'
import type { CodexRemoteRuntimeState } from './codexRemoteSupport'

function createState(): CodexRemoteRuntimeState {
    return {
        currentThreadId: 'thread-parent',
        currentTurnId: 'turn-parent',
        activeChildTurns: new Map(),
        suppressedTurnIds: [],
        suppressAnonymousTurnEvents: false,
        turnInFlight: true,
        allowAnonymousTerminalEvent: false,
    }
}

describe('registerCodexNotificationHandler', () => {
    it('tracks non-current child turns for later abort without dispatching them to the parent transcript', () => {
        const state = createState()
        const registry: { handler: ((method: string, params: unknown) => void) | null } = { handler: null }
        const handledEvents: Record<string, unknown>[] = []

        registerCodexNotificationHandler({
            state,
            appServerClient: {
                setNotificationHandler(nextHandler: typeof registry.handler) {
                    registry.handler = nextHandler
                },
            } as never,
            appServerEventConverter: {
                handleNotification: () => [{ type: 'task_started' }],
            } as never,
            handleCodexEvent: (event) => handledEvents.push(event),
        })

        const notificationHandler = registry.handler
        if (!notificationHandler) {
            throw new Error('notification handler was not registered')
        }

        notificationHandler('turn/started', {
            thread: { id: 'thread-child' },
            turn: { id: 'turn-child' },
        })

        expect(state.activeChildTurns.get('thread-child')).toBe('turn-child')
        expect(handledEvents).toEqual([])

        notificationHandler('turn/completed', {
            threadId: 'thread-child',
            turnId: 'turn-child',
        })

        expect(state.activeChildTurns.has('thread-child')).toBe(false)
    })
})
