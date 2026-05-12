import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recoverRemotePairingFromCookie } from './remotePairingCookieRecover'

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
    return new Response(JSON.stringify(payload), {
        status: init.status ?? 200,
        headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    })
}

describe('recoverRemotePairingFromCookie', () => {
    const originalFetch = globalThis.fetch

    beforeEach(() => {
        globalThis.fetch = vi.fn() as unknown as typeof fetch
    })

    afterEach(() => {
        globalThis.fetch = originalFetch
    })

    it('returns ok with the parsed payload when the broker recovers an approved pairing so the PWA can navigate directly into the workspace', async () => {
        const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
        fetchMock.mockResolvedValue(
            jsonResponse({ pairingId: 'pairing-1', handoffTicket: 'ticket-1', expiresAt: 1234567890 })
        )

        const result = await recoverRemotePairingFromCookie()
        expect(result).toEqual({
            ok: true,
            value: { pairingId: 'pairing-1', handoffTicket: 'ticket-1', expiresAt: 1234567890 },
        })

        const call = fetchMock.mock.calls[0]
        expect(call[0]).toBe('/pairings/cookie-recover')
        const init = call[1] as RequestInit
        expect(init.credentials).toBe('include')
        expect(init.cache).toBe('no-store')
    })

    it('maps `pairing_cookie_missing` to a terminal missing failure so the UI immediately offers the re-scan path', async () => {
        const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
        fetchMock.mockResolvedValue(jsonResponse({ code: 'pairing_cookie_missing' }, { status: 401 }))

        const result = await recoverRemotePairingFromCookie()
        expect(result).toEqual({ ok: false, failure: { kind: 'missing' } })
    })

    it('maps `pairing_cookie_invalid` to a terminal invalid failure so the UI does not loop on a tampered cookie', async () => {
        const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
        fetchMock.mockResolvedValue(jsonResponse({ code: 'pairing_cookie_invalid' }, { status: 401 }))

        const result = await recoverRemotePairingFromCookie()
        expect(result).toEqual({ ok: false, failure: { kind: 'invalid' } })
    })

    it('maps `pairing_unavailable` to a terminal unavailable failure so the user sees the same prompt as any other dead-pairing surface', async () => {
        const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
        fetchMock.mockResolvedValue(jsonResponse({ code: 'pairing_unavailable' }, { status: 410 }))

        const result = await recoverRemotePairingFromCookie()
        expect(result).toEqual({ ok: false, failure: { kind: 'unavailable' } })
    })

    it('maps network exceptions and 5xx server errors to a transient failure so the UI can offer a retry without flipping into a terminal screen', async () => {
        const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
        fetchMock.mockRejectedValueOnce(new Error('network down'))
        await expect(recoverRemotePairingFromCookie()).resolves.toEqual({
            ok: false,
            failure: { kind: 'transient' },
        })

        fetchMock.mockResolvedValueOnce(jsonResponse({}, { status: 502 }))
        await expect(recoverRemotePairingFromCookie()).resolves.toEqual({
            ok: false,
            failure: { kind: 'transient' },
        })
    })
})
