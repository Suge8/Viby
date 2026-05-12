import { describe, expect, it } from 'bun:test'
import { createDeviceAuthRateLimiter } from './deviceAuthRateLimit'

function context(ip: string) {
    return {
        req: {
            header(name: string) {
                return name === 'x-forwarded-for' ? ip : undefined
            },
        },
    } as never
}

describe('deviceAuthRateLimit', () => {
    it('rate limits pairing-code attempts per client', async () => {
        let now = 1_000
        const enforce = createDeviceAuthRateLimiter(() => now)

        for (let index = 0; index < 8; index += 1) {
            expect(enforce(context('1.2.3.4'))).toBeNull()
        }

        const blocked = enforce(context('1.2.3.4'))
        expect(blocked?.status).toBe(429)
        expect(await blocked!.json()).toEqual({
            error: 'Too many pairing attempts',
            code: 'device_pairing_rate_limited',
        })

        now += 60_000
        expect(enforce(context('1.2.3.4'))).toBeNull()
    })
})
