import { describe, expect, it, vi } from 'vitest'
import { runRuntimeTurnOwner } from './runtimeTurnOwner'

describe('runtimeTurnOwner', () => {
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
            onTurnStart: (batch) => {
                events.push(`start:${batch.message}`)
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

    it('surfaces turn errors before clearing thinking and emitting ready', async () => {
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
            runTurn: async () => {
                throw error
            },
            onTurnError: (received) => {
                events.push(received === error ? 'error' : 'wrong-error')
            },
            setThinking: (thinking) => {
                events.push(`thinking:${thinking}`)
            },
        })

        expect(events).toEqual(['thinking:true', 'error', 'thinking:false', 'ready'])
    })
})
