import { describe, expect, it } from 'vitest'
import { parseRateLimitText } from './rateLimitParser'

describe('parseRateLimitText', () => {
    it('ignores normal text and unrelated JSON', () => {
        expect(parseRateLimitText('hello')).toBeNull()
        expect(parseRateLimitText('{"type":"message"}')).toBeNull()
    })

    it('converts warning and rejected events to compact text events', () => {
        expect(
            parseRateLimitText(
                JSON.stringify({
                    type: 'rate_limit_event',
                    rate_limit_info: {
                        status: 'allowed_warning',
                        resetsAt: 1774278000.2,
                        utilization: 0.9,
                        rateLimitType: 'five_hour',
                    },
                })
            )
        ).toEqual({
            suppress: false,
            message: { type: 'text', text: 'Claude AI usage limit warning|1774278000|90|five_hour' },
        })

        expect(
            parseRateLimitText(
                JSON.stringify({
                    type: 'rate_limit_event',
                    rate_limit_info: {
                        status: 'rejected',
                        resetsAt: 1774278000,
                        rateLimitType: 'seven_day',
                    },
                })
            )
        ).toEqual({
            suppress: false,
            message: { type: 'text', text: 'Claude AI usage limit reached|1774278000|seven_day' },
        })
    })

    it('suppresses noisy or malformed rate limit events', () => {
        expect(
            parseRateLimitText(
                JSON.stringify({
                    type: 'output',
                    data: {
                        type: 'rate_limit_event',
                        rate_limit_info: { status: 'allowed' },
                    },
                })
            )
        ).toEqual({ suppress: true })

        expect(
            parseRateLimitText(
                JSON.stringify({
                    type: 'rate_limit_event',
                    rate_limit_info: { status: 'future_status', resetsAt: 1774278000 },
                })
            )
        ).toEqual({ suppress: true })
    })
})
