import { describe, expect, it } from 'bun:test'
import { median, parseRepeatArg, summarizeTiming } from './providerStartupTiming'

describe('provider startup timing helpers', () => {
    it('uses the upper median for deterministic integer timing samples', () => {
        expect(median([9, 3, 5])).toBe(5)
        expect(median([9, 3, 5, 7])).toBe(7)
    })

    it('summarizes a provider timing sample without hiding outliers', () => {
        expect(summarizeTiming('claude', [30, 10, 20])).toEqual({
            driver: 'claude',
            durationsMs: [30, 10, 20],
            medianMs: 20,
            minMs: 10,
            maxMs: 30,
        })
    })

    it('parses repeat arguments with a safe default', () => {
        expect(parseRepeatArg(['--repeat=5'])).toBe(5)
        expect(parseRepeatArg(['--repeat=0'])).toBe(3)
        expect(parseRepeatArg([])).toBe(3)
    })
})
