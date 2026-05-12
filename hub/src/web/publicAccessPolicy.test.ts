import { describe, expect, it } from 'bun:test'
import { isAllowedByPublicAccessPolicy } from './publicAccessPolicy'

function request(headers: Record<string, string>): Request {
    return new Request('http://127.0.0.1:37173/api/auth', { headers })
}

describe('publicAccessPolicy', () => {
    it('allows all requests when public access is enabled', () => {
        expect(isAllowedByPublicAccessPolicy(request({ host: 'hub.example.com' }), true)).toBe(true)
    })

    it('keeps loopback and LAN access when public access is disabled', () => {
        expect(isAllowedByPublicAccessPolicy(request({ host: '127.0.0.1:37173' }), false)).toBe(true)
        expect(isAllowedByPublicAccessPolicy(request({ host: '192.168.1.8:37173' }), false)).toBe(true)
        expect(isAllowedByPublicAccessPolicy(request({ host: '100.88.1.5:37173' }), false)).toBe(true)
    })

    it('rejects public host or origin when public access is disabled', () => {
        expect(isAllowedByPublicAccessPolicy(request({ host: 'hub.example.com' }), false)).toBe(false)
        expect(
            isAllowedByPublicAccessPolicy(
                request({ host: '192.168.1.8:37173', origin: 'https://evil.example.com' }),
                false
            )
        ).toBe(false)
    })

    it('rejects public forwarded clients behind local proxies', () => {
        expect(
            isAllowedByPublicAccessPolicy(request({ host: '127.0.0.1:37173', 'x-forwarded-for': '203.0.113.9' }), false)
        ).toBe(false)
    })

    it('applies the same local-network gate to cf client IPs', () => {
        expect(
            isAllowedByPublicAccessPolicy(request({ host: '127.0.0.1:37173', 'cf-connecting-ip': '10.0.0.2' }), false)
        ).toBe(true)
        expect(
            isAllowedByPublicAccessPolicy(
                request({ host: '127.0.0.1:37173', 'cf-connecting-ip': '203.0.113.9' }),
                false
            )
        ).toBe(false)
    })

    it('checks only the first forwarded client IP', () => {
        expect(
            isAllowedByPublicAccessPolicy(
                request({ host: '127.0.0.1:37173', 'x-forwarded-for': '10.0.0.2, 203.0.113.9' }),
                false
            )
        ).toBe(true)
    })

    it('uses forwarded host before local proxy host', () => {
        expect(
            isAllowedByPublicAccessPolicy(
                request({ host: '127.0.0.1:37173', 'x-forwarded-host': 'hub.example.com' }),
                false
            )
        ).toBe(false)
    })
})
