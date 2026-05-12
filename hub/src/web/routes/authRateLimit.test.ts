import { describe, expect, it } from 'bun:test'
import { createAuthFailureRateLimiter } from './authRateLimit'

function context(ip: string) {
    return {
        req: {
            header(name: string) {
                return name === 'x-forwarded-for' ? ip : undefined
            },
        },
    } as never
}

describe('authRateLimit', () => {
    it('rate limits repeated auth failures per client', async () => {
        let now = 1_000
        const enforce = createAuthFailureRateLimiter(() => now)

        for (let index = 0; index < 12; index += 1) {
            expect(enforce(context('1.2.3.4'))).toBeNull()
        }

        const blocked = enforce(context('1.2.3.4'))
        expect(blocked?.status).toBe(429)
        expect(await blocked!.json()).toEqual({ error: 'Too many authentication attempts', code: 'auth_rate_limited' })

        now += 60_000
        expect(enforce(context('1.2.3.4'))).toBeNull()
    })
})
