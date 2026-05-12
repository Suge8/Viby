import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRemotePairingLivenessProbe } from './remotePairingLivenessProbe'

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('remotePairingLivenessProbe', () => {
    it('fires onStale after the probe timeout when no inbound activity arrives', () => {
        const onStale = vi.fn()
        const probe = createRemotePairingLivenessProbe({ onStale, timeoutMs: 4_000 })

        probe.arm()
        vi.advanceTimersByTime(3_999)
        expect(onStale).not.toHaveBeenCalled()

        vi.advanceTimersByTime(2)
        expect(onStale).toHaveBeenCalledTimes(1)
    })

    it('clears an armed probe as soon as any inbound activity is recorded', () => {
        const onStale = vi.fn()
        const probe = createRemotePairingLivenessProbe({ onStale, timeoutMs: 4_000 })

        probe.arm()
        probe.noteInbound()
        vi.advanceTimersByTime(10_000)

        expect(onStale).not.toHaveBeenCalled()
    })

    it('is idempotent so concurrent foreground pulses do not stack timers', () => {
        const onStale = vi.fn()
        const probe = createRemotePairingLivenessProbe({ onStale, timeoutMs: 4_000 })

        probe.arm()
        probe.arm()
        probe.arm()
        vi.advanceTimersByTime(4_001)

        expect(onStale).toHaveBeenCalledTimes(1)
    })

    it('records idle duration relative to last inbound activity', () => {
        let currentTime = 1_000
        const onStale = vi.fn()
        const probe = createRemotePairingLivenessProbe({
            onStale,
            timeoutMs: 4_000,
            now: () => currentTime,
        })

        expect(probe.getIdleMs()).toBe(0)

        currentTime = 5_500
        expect(probe.getIdleMs()).toBe(4_500)

        probe.noteInbound()
        expect(probe.getIdleMs()).toBe(0)
    })

    it('stops firing after dispose so a torn-down bridge never resurrects', () => {
        const onStale = vi.fn()
        const probe = createRemotePairingLivenessProbe({ onStale, timeoutMs: 4_000 })

        probe.arm()
        probe.dispose()
        vi.advanceTimersByTime(10_000)

        expect(onStale).not.toHaveBeenCalled()
    })
})
