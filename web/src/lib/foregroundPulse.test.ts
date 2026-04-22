import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetForegroundPulseForTests, subscribeForegroundPulse } from '@/lib/foregroundPulse'

describe('foregroundPulse', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        resetForegroundPulseForTests()
    })

    it('emits one visible pulse through the shared listener owner', () => {
        const pulses: string[] = []
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
        })

        subscribeForegroundPulse((pulse) => {
            pulses.push(pulse.reason)
        })

        document.dispatchEvent(new Event('visibilitychange'))

        expect(pulses).toEqual(['visible'])
    })

    it('deduplicates near-simultaneous focus and visibility pulses', () => {
        vi.useFakeTimers()
        const pulses: string[] = []
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
        })

        subscribeForegroundPulse((pulse) => {
            pulses.push(pulse.reason)
        })

        window.dispatchEvent(new Event('focus'))
        document.dispatchEvent(new Event('visibilitychange'))
        vi.advanceTimersByTime(300)
        window.dispatchEvent(new Event('focus'))

        expect(pulses).toEqual(['focus', 'focus'])
        vi.useRealTimers()
    })

    it('treats document resume as a foreground pulse through the shared owner', () => {
        const pulses: string[] = []
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
        })

        subscribeForegroundPulse((pulse) => {
            pulses.push(pulse.reason)
        })

        document.dispatchEvent(new Event('resume'))

        expect(pulses).toEqual(['resume'])
    })
})
