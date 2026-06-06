import { afterEach, describe, expect, it, vi } from 'vitest'
import { runRuntimeTurnOwner } from './runtimeTurnOwner'

describe('runtimeTurnOwner', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('owns thinking cleanup and ready emission around a successful turn', async () => {
        const events: string[] = []
        const batches = [{ message: 'hello' }]

        await runRuntimeTurnOwner({
            label: '[test-turn-owner]',
            sessionClient: { sendSessionEvent: (event: { type: string }) => events.push(event.type) } as never,
            queueSize: () => batches.length,
            shouldExit: () => false,
            sendReady: () => events.push('ready'),
            getAbortSignal: () => new AbortController().signal,
            waitForTurn: async () => batches.shift() ?? null,
            beforeTurn: (batch) => {
                events.push(`start:${batch.message}`)
                return { type: 'continue', prepared: batch }
            },
            runTurn: async (batch) => {
                events.push(`run:${batch.message}`)
            },
            setThinking: (thinking) => {
                events.push(`thinking:${thinking}`)
            },
        })

        expect(events).toEqual(['start:hello', 'thinking:true', 'run:hello', 'thinking:false', 'ready'])
    })

    it('waits for provider settle and suppresses ready when another message is queued', async () => {
        const events: string[] = []
        let queueSize = 0
        let waitCalls = 0
        let resolveSettled!: () => void
        const settled = new Promise<void>((resolve) => {
            resolveSettled = resolve
        })

        const owner = runRuntimeTurnOwner({
            label: '[test-turn-owner]',
            sessionClient: { sendSessionEvent: vi.fn() } as never,
            queueSize: () => queueSize,
            shouldExit: () => false,
            sendReady: () => events.push('ready'),
            getAbortSignal: () => new AbortController().signal,
            waitForTurn: async () => {
                waitCalls += 1
                return waitCalls === 1 ? { message: 'one' } : null
            },
            beforeTurn: (batch) => ({ type: 'continue', prepared: batch }),
            runTurn: async () => {
                events.push('run')
            },
            waitUntilReadyForNextTurn: async () => {
                events.push('wait-settle')
                await settled
            },
            setThinking: (thinking) => {
                events.push(`thinking:${thinking}`)
            },
        })

        await vi.waitFor(() => expect(events).toContain('wait-settle'))
        expect(events).not.toContain('ready')

        queueSize = 1
        resolveSettled()
        await owner

        expect(events).toEqual(['thinking:true', 'run', 'wait-settle', 'thinking:false'])
    })

    it('lets beforeTurn handle provider-owned commands without running a normal turn', async () => {
        const runTurn = vi.fn()
        const setThinking = vi.fn()
        let waitCalls = 0

        await runRuntimeTurnOwner({
            label: '[test-turn-owner]',
            sessionClient: { sendSessionEvent: vi.fn() } as never,
            queueSize: () => 0,
            shouldExit: () => false,
            getAbortSignal: () => new AbortController().signal,
            waitForTurn: async () => {
                waitCalls += 1
                return waitCalls === 1 ? { message: '/clear' } : null
            },
            beforeTurn: () => ({ type: 'handled' }),
            runTurn,
            setThinking,
        })

        expect(runTurn).not.toHaveBeenCalled()
        expect(setThinking).not.toHaveBeenCalled()
    })

    it('does not schedule a ready delay timer', async () => {
        vi.useFakeTimers()

        await runRuntimeTurnOwner({
            label: '[test-turn-owner]',
            sessionClient: { sendSessionEvent: vi.fn() } as never,
            queueSize: () => 0,
            shouldExit: () => false,
            getAbortSignal: () => new AbortController().signal,
            waitForTurn: vi.fn().mockResolvedValueOnce({ message: 'hello' }).mockResolvedValueOnce(null),
            beforeTurn: (batch) => ({ type: 'continue', prepared: batch }),
            runTurn: async () => {},
            setThinking: vi.fn(),
        })

        expect(vi.getTimerCount()).toBe(0)
    })

    it('surfaces turn errors before cleanup and ready', async () => {
        const events: string[] = []
        const error = new Error('provider failed')

        await runRuntimeTurnOwner({
            label: '[test-turn-owner]',
            sessionClient: { sendSessionEvent: vi.fn() } as never,
            queueSize: () => 0,
            shouldExit: () => false,
            sendReady: () => events.push('ready'),
            getAbortSignal: () => new AbortController().signal,
            waitForTurn: vi.fn().mockResolvedValueOnce({ message: 'hello' }).mockResolvedValueOnce(null),
            beforeTurn: (batch) => ({ type: 'continue', prepared: batch }),
            runTurn: async () => {
                throw error
            },
            onTurnError: (received) => {
                events.push(received === error ? 'error' : 'wrong-error')
            },
            afterTurn: (reason) => {
                events.push(`after:${reason}`)
            },
            setThinking: (thinking) => {
                events.push(`thinking:${thinking}`)
            },
        })

        expect(events).toEqual(['thinking:true', 'error', 'thinking:false', 'after:error', 'ready'])
    })

    it('passes success, error, and abort reasons to afterTurn', async () => {
        const reasons: string[] = []

        await runRuntimeTurnOwner<{ message: string }>({
            label: '[test-turn-owner]',
            sessionClient: { sendSessionEvent: vi.fn() } as never,
            queueSize: () => 0,
            shouldExit: () => false,
            getAbortSignal: () => new AbortController().signal,
            waitForTurn: vi
                .fn()
                .mockResolvedValueOnce({ message: 'success' })
                .mockResolvedValueOnce({ message: 'error' })
                .mockResolvedValueOnce({ message: 'abort' })
                .mockResolvedValueOnce(null),
            beforeTurn: (batch) => ({ type: 'continue', prepared: batch }),
            runTurn: async (batch) => {
                if (batch.message === 'error') throw new Error('boom')
                if (batch.message === 'abort') throw Object.assign(new Error('aborted'), { name: 'AbortError' })
            },
            afterTurn: (reason) => {
                reasons.push(reason)
            },
            setThinking: vi.fn(),
        })

        expect(reasons).toEqual(['success', 'error', 'abort'])
    })
})
