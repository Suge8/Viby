import { describe, expect, it, vi } from 'vitest'
import type { CodexRemoteRuntimeState } from './codexRemoteSupport'
import { abortCodexTurn, finalizeIdleTurn, recoverFromTurnStartError } from './codexRemoteTurnLifecycle'

function createState(): CodexRemoteRuntimeState {
    return {
        currentThreadId: 'thread-1',
        currentTurnId: 'turn-1',
        activeChildTurns: new Map(),
        suppressedTurnIds: [],
        suppressAnonymousTurnEvents: false,
        turnInFlight: false,
        allowAnonymousTerminalEvent: false,
    }
}

describe('codexRemoteTurnLifecycle', () => {
    it('interrupts active child turns when aborting the parent turn', async () => {
        const state = createState()
        state.activeChildTurns.set('thread-child-a', 'turn-child-a')
        state.activeChildTurns.set('thread-child-b', 'turn-child-b')
        const interruptTurn = vi.fn(async () => ({ ok: true }))

        await abortCodexTurn({
            state,
            appServerClient: { interruptTurn },
            abortController: new AbortController(),
            resetQueue: vi.fn(),
            clearAssistantStream: vi.fn(),
            setThinking: vi.fn(),
            resetPermissionHandler: vi.fn(),
            abortReasoning: vi.fn(),
            resetDiff: vi.fn(),
            replaceAbortController: vi.fn(),
        })

        expect(interruptTurn).toHaveBeenCalledWith({ threadId: 'thread-1', turnId: 'turn-1' })
        expect(interruptTurn).toHaveBeenCalledWith({ threadId: 'thread-child-a', turnId: 'turn-child-a' })
        expect(interruptTurn).toHaveBeenCalledWith({ threadId: 'thread-child-b', turnId: 'turn-child-b' })
        expect(state.activeChildTurns.size).toBe(0)
    })

    it('clears tracked child turns after a best-effort abort even when interrupt fails', async () => {
        const state = createState()
        state.activeChildTurns.set('thread-child', 'turn-child')
        const interruptTurn = vi.fn(async ({ threadId }: { threadId: string }) => {
            if (threadId === 'thread-child') {
                throw new Error('child interrupt failed')
            }
            return { ok: true }
        })

        await abortCodexTurn({
            state,
            appServerClient: { interruptTurn },
            abortController: new AbortController(),
            resetQueue: vi.fn(),
            clearAssistantStream: vi.fn(),
            setThinking: vi.fn(),
            resetPermissionHandler: vi.fn(),
            abortReasoning: vi.fn(),
            resetDiff: vi.fn(),
            replaceAbortController: vi.fn(),
        })

        expect(interruptTurn).toHaveBeenCalledWith({ threadId: 'thread-child', turnId: 'turn-child' })
        expect(state.activeChildTurns.size).toBe(0)
    })

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
