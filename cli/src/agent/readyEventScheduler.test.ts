import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
    emitReadyIfIdle: vi.fn(),
    runDetachedTask: vi.fn(),
}))

vi.mock('@/agent/emitReadyIfIdle', () => ({
    emitReadyIfIdle: harness.emitReadyIfIdle,
}))

vi.mock('@/utils/runDetachedTask', () => ({
    runDetachedTask: harness.runDetachedTask,
}))

import { createReadyEventScheduler } from './readyEventScheduler'

function createScheduler() {
    return createReadyEventScheduler({
        label: 'scheduler-test',
        hasPending: () => false,
        queueSize: () => 0,
        shouldExit: () => false,
        sendReady: vi.fn(),
    })
}

describe('readyEventScheduler', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.clearAllMocks()
        harness.emitReadyIfIdle.mockResolvedValue(true)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('delegates emitNow to emitReadyIfIdle and preserves the result', async () => {
        const scheduler = createScheduler()

        await expect(scheduler.emitNow()).resolves.toBe(true)
        expect(harness.emitReadyIfIdle).toHaveBeenCalledTimes(1)
        expect(harness.emitReadyIfIdle).toHaveBeenCalledWith(expect.objectContaining({ label: 'scheduler-test' }))
    })

    it('schedules only the latest timer and emits through the detached task owner', async () => {
        const scheduler = createScheduler()

        scheduler.schedule(50)
        scheduler.schedule(80)

        expect(scheduler.isScheduled()).toBe(true)
        vi.advanceTimersByTime(79)
        expect(harness.runDetachedTask).not.toHaveBeenCalled()

        vi.advanceTimersByTime(1)
        expect(scheduler.isScheduled()).toBe(false)
        expect(harness.runDetachedTask).toHaveBeenCalledTimes(1)
        expect(harness.runDetachedTask).toHaveBeenCalledWith(
            expect.any(Function),
            'scheduler-test: ready emission failed'
        )

        const scheduledTask = vi.mocked(harness.runDetachedTask).mock.calls[0]?.[0]
        expect(typeof scheduledTask).toBe('function')
        await expect(scheduledTask?.()).resolves.toBe(true)
        expect(harness.emitReadyIfIdle).toHaveBeenCalledTimes(1)
    })

    it('cancels and disposes pending timers without emitting', () => {
        const scheduler = createScheduler()

        scheduler.schedule(25)
        scheduler.cancel()
        expect(scheduler.isScheduled()).toBe(false)

        scheduler.schedule(25)
        scheduler.dispose()
        vi.advanceTimersByTime(25)

        expect(harness.runDetachedTask).not.toHaveBeenCalled()
        expect(scheduler.isScheduled()).toBe(false)
    })
})
