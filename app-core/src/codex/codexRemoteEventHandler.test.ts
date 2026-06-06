import { describe, expect, it, vi } from 'vitest'
import { createCodexEventHandler } from './codexRemoteEventHandler'
import type { CodexRemoteRuntimeState } from './codexRemoteSupport'

function createState(): CodexRemoteRuntimeState {
    return {
        currentThreadId: 'thread-1',
        currentTurnId: null,
        activeChildTurns: new Map(),
        suppressedTurnIds: [],
        suppressAnonymousTurnEvents: false,
        turnInFlight: true,
        allowAnonymousTerminalEvent: false,
    }
}

describe('createCodexEventHandler', () => {
    it('settles anonymous streamed turns after resume', () => {
        const state = createState()
        const clearAssistantStream = vi.fn()
        const notifyTurnSettled = vi.fn()
        const session = {
            thinking: true,
            onThinkingChange: vi.fn(),
            sendCodexMessage: vi.fn(),
        }
        const handler = createCodexEventHandler({
            session: session as never,
            state,
            messageBuffer: { addMessage: vi.fn() } as never,
            reasoningProcessor: { processDelta: vi.fn(), complete: vi.fn(), handleSectionBreak: vi.fn() } as never,
            diffProcessor: { reset: vi.fn(), processDiff: vi.fn() } as never,
            bindThreadId: vi.fn(),
            appendAssistantStream: vi.fn(),
            acknowledgeAssistantTurn: vi.fn(),
            notifyTurnSettled,
        })

        handler({ type: 'agent_message_delta', delta: 'hello', item_id: 'msg-1' })
        handler({ type: 'task_complete' })

        expect(clearAssistantStream).not.toHaveBeenCalled()
        expect(notifyTurnSettled).toHaveBeenCalledTimes(1)
        expect(state.turnInFlight).toBe(false)
        expect(session.onThinkingChange).not.toHaveBeenCalled()
    })
})
