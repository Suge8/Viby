import { describe, expect, it, vi } from 'vitest'
import type { CodexRemoteRuntimeState } from './codexRemoteSupport'
import { finalizeIdleTurn, recoverFromTurnStartError } from './codexRemoteTurnLifecycle'

function createState(): CodexRemoteRuntimeState {
    return {
        currentThreadId: 'thread-1',
        currentTurnId: 'turn-1',
        suppressedTurnIds: [],
        suppressAnonymousTurnEvents: false,
        turnInFlight: false,
        allowAnonymousTerminalEvent: false,
    }
}

describe('codexRemoteTurnLifecycle', () => {
    it('surfaces the concrete turn-start error and still returns the session to ready', async () => {
        const state = createState()
        const addMessage = vi.fn()
        const sendSessionMessage = vi.fn()
        const emitReady = vi.fn(async () => true)

        recoverFromTurnStartError({
            error: new Error("Collaboration mode 'plan' requires a resolved model"),
            state,
            messageBuffer: { addMessage } as never,
            clearAssistantStream: vi.fn(),
            notifyTurnSettled: vi.fn(),
            sendSessionMessage,
            resetThreadState: vi.fn(),
        })

        expect(addMessage).toHaveBeenCalledWith("Collaboration mode 'plan' requires a resolved model", 'status')
        expect(sendSessionMessage).toHaveBeenCalledWith("Collaboration mode 'plan' requires a resolved model")

        await finalizeIdleTurn({
            state,
            clearAssistantStream: vi.fn(),
            resetPermissionHandler: vi.fn(),
            abortReasoning: vi.fn(),
            resetDiff: vi.fn(),
            resetEventConverter: vi.fn(),
            setThinking: vi.fn(),
            clearReadyAfterTurnTimer: vi.fn(),
            emitReady,
        })

        expect(emitReady).toHaveBeenCalledTimes(1)
    })
})
