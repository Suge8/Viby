import { describe, expect, it } from 'bun:test'
import { getRunnerRestartDelayMs, recoverManagedRunner, type RunnerRecoveryMode, type RunnerRetryContext } from './supervisor'

describe('getRunnerRestartDelayMs', () => {
    it('uses exponential backoff with an upper bound', () => {
        expect(getRunnerRestartDelayMs(1)).toBe(1_000)
        expect(getRunnerRestartDelayMs(2)).toBe(2_000)
        expect(getRunnerRestartDelayMs(3)).toBe(4_000)
        expect(getRunnerRestartDelayMs(99)).toBe(30_000)
    })
})

describe('recoverManagedRunner', () => {
    it('retries startup failures until the runner comes online', async () => {
        const scheduled: RunnerRetryContext[] = []
        const sleeps: number[] = []
        let activeRunner = false
        let startAttempts = 0
        let cleanupCalls = 0
        let recoveredMode: RunnerRecoveryMode | null = null

        await recoverManagedRunner({
            mode: 'startup',
            isShuttingDown: () => false,
            hasRunnerProcess: () => activeRunner,
            startRunner: async () => {
                startAttempts += 1
                if (startAttempts === 1) {
                    throw new Error('first startup failed')
                }
                activeRunner = true
            },
            cleanupRunner: async () => {
                cleanupCalls += 1
                activeRunner = false
            },
            onRetryScheduled: (context) => {
                scheduled.push(context)
            },
            onRecovered: (mode) => {
                recoveredMode = mode
            },
            sleepMs: async (delayMs) => {
                sleeps.push(delayMs)
            }
        })

        expect(startAttempts).toBe(2)
        expect(cleanupCalls).toBe(1)
        expect(scheduled).toHaveLength(1)
        expect(scheduled[0]).toMatchObject({
            mode: 'startup',
            attempt: 1,
            delayMs: 1_000
        })
        expect(scheduled[0]?.error).toBeInstanceOf(Error)
        expect(sleeps).toEqual([1_000])
        expect(recoveredMode === 'startup').toBe(true)
    })

    it('announces restart immediately and keeps backing off after repeated failures', async () => {
        const scheduled: RunnerRetryContext[] = []
        const sleeps: number[] = []
        let activeRunner = false
        let startAttempts = 0
        let cleanupCalls = 0
        let recoveredMode: RunnerRecoveryMode | null = null

        await recoverManagedRunner({
            mode: 'restart',
            isShuttingDown: () => false,
            hasRunnerProcess: () => activeRunner,
            startRunner: async () => {
                startAttempts += 1
                if (startAttempts === 1) {
                    throw new Error('restart failed')
                }
                activeRunner = true
            },
            cleanupRunner: async () => {
                cleanupCalls += 1
                activeRunner = false
            },
            onRetryScheduled: (context) => {
                scheduled.push(context)
            },
            onRecovered: (mode) => {
                recoveredMode = mode
            },
            sleepMs: async (delayMs) => {
                sleeps.push(delayMs)
            },
            exit: {
                code: 137,
                signal: 'SIGKILL'
            }
        })

        expect(startAttempts).toBe(2)
        expect(cleanupCalls).toBe(1)
        expect(sleeps).toEqual([1_000, 2_000])
        expect(scheduled).toHaveLength(2)
        expect(scheduled[0]).toMatchObject({
            mode: 'restart',
            attempt: 1,
            delayMs: 1_000,
            exit: {
                code: 137,
                signal: 'SIGKILL'
            }
        })
        expect(scheduled[0]?.error).toBeUndefined()
        expect(scheduled[1]).toMatchObject({
            mode: 'restart',
            attempt: 2,
            delayMs: 2_000
        })
        expect(scheduled[1]?.error).toBeInstanceOf(Error)
        expect(recoveredMode === 'restart').toBe(true)
    })
})
