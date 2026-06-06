import { describe, expect, it, vi } from 'vitest'
import { RealtimeRecoveryRuntime } from '@/lib/realtimeRecoveryRuntime'

function createDeferred() {
    let resolve!: () => void
    const promise = new Promise<void>((done) => {
        resolve = done
    })
    return { promise, resolve }
}

describe('RealtimeRecoveryRuntime', () => {
    it('socket reconnect triggers recovery', async () => {
        const runRecovery = vi.fn(async () => undefined)
        const runtime = new RealtimeRecoveryRuntime({ runRecovery })

        await runtime.handleSocketConnect({ initial: false, recovered: true, transport: 'websocket' })

        expect(runRecovery).toHaveBeenCalledWith('socket-reconnect')
        expect(runtime.getSnapshot().status).toBe('idle')
    })

    it('foreground visible/resume dedupes recovery', async () => {
        let now = 1_000
        const runRecovery = vi.fn(async (_trigger: unknown) => undefined)
        const runtime = new RealtimeRecoveryRuntime({ runRecovery, now: () => now })

        await runtime.handleForegroundPulse({ at: now, reason: 'visible' })
        now += 100
        await runtime.handleForegroundPulse({ at: now, reason: 'resume' })
        now += 1_000
        await runtime.handleForegroundPulse({ at: now, reason: 'resume' })

        expect(runRecovery).toHaveBeenCalledTimes(2)
        expect(runRecovery.mock.calls.map((call) => call[0])).toEqual(['foreground', 'foreground'])
    })

    it('pageshow-restored triggers recovery', async () => {
        const runRecovery = vi.fn(async () => undefined)
        const runtime = new RealtimeRecoveryRuntime({ runRecovery })

        await runtime.handleForegroundPulse({ at: 1, reason: 'pageshow-restored' })

        expect(runRecovery).toHaveBeenCalledWith('page-restored')
    })

    it('does not schedule a silent stale timer', () => {
        vi.useFakeTimers()
        try {
            const runRecovery = vi.fn(async () => undefined)
            new RealtimeRecoveryRuntime({ runRecovery })

            vi.advanceTimersByTime(60_000)

            expect(vi.getTimerCount()).toBe(0)
            expect(runRecovery).not.toHaveBeenCalled()
        } finally {
            vi.useRealTimers()
        }
    })

    it('in-flight recovery dedupes', async () => {
        const recovery = createDeferred()
        const runRecovery = vi.fn(() => recovery.promise)
        const runtime = new RealtimeRecoveryRuntime({ runRecovery })

        const first = runtime.handleSocketConnect({ initial: false, recovered: false, transport: 'websocket' })
        const second = runtime.handleForegroundPulse({ at: 1, reason: 'visible' })
        await Promise.resolve()

        expect(runRecovery).toHaveBeenCalledTimes(1)
        expect(runtime.getSnapshot().status).toBe('syncing')

        recovery.resolve()
        await Promise.all([first, second])

        expect(runtime.getSnapshot().status).toBe('idle')
    })

    it('returns to reconnecting when socket drops during recovery', async () => {
        const recovery = createDeferred()
        const runtime = new RealtimeRecoveryRuntime({ runRecovery: vi.fn(() => recovery.promise) })

        runtime.handleSocketConnect({ initial: true, recovered: false, transport: 'websocket' })
        const task = runtime.handleForegroundPulse({ at: 1, reason: 'visible' })
        runtime.handleSocketDisconnect()
        recovery.resolve()
        await task

        expect(runtime.getSnapshot().status).toBe('reconnecting')
    })

    it('failure enters failed', async () => {
        const error = new Error('sync failed')
        const reportRecoveryError = vi.fn()
        const runtime = new RealtimeRecoveryRuntime({
            runRecovery: vi.fn(async () => {
                throw error
            }),
            reportRecoveryError,
        })

        await runtime.handleSocketConnect({ initial: false, recovered: false, transport: 'websocket' })

        expect(runtime.getSnapshot()).toMatchObject({
            status: 'failed',
            failure: { trigger: 'socket-reconnect', error },
        })
        expect(reportRecoveryError).toHaveBeenCalledWith('socket-reconnect', error)
    })

    it('retry exits failed and reruns', async () => {
        const runRecovery = vi.fn<(trigger: unknown) => Promise<void>>()
        runRecovery.mockRejectedValueOnce(new Error('first failed'))
        runRecovery.mockResolvedValueOnce()
        const runtime = new RealtimeRecoveryRuntime({ runRecovery })

        await runtime.handleSocketConnect({ initial: false, recovered: false, transport: 'websocket' })
        expect(runtime.getSnapshot().status).toBe('failed')

        const retry = runtime.retry()
        expect(runtime.getSnapshot().status).toBe('syncing')
        await retry

        expect(runRecovery.mock.calls.map((call) => call[0])).toEqual(['socket-reconnect', 'user-retry'])
        expect(runtime.getSnapshot().status).toBe('idle')
    })
})
