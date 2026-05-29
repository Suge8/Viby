import { renderHook, waitFor } from '@testing-library/react'
import { PROTOCOL_VERSION } from '@viby/protocol'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/hooks/useAuth'
import { resetForegroundPulseForTests } from '@/lib/foregroundPulse'

function encodeBase64Url(value: string): string {
    return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function createJwt(expSeconds: number): string {
    const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const payload = encodeBase64Url(JSON.stringify({ exp: expSeconds }))
    return `${header}.${payload}.signature`
}

function mockHubHealth() {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
        async () =>
            new Response(JSON.stringify({ protocolVersion: PROTOCOL_VERSION }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            })
    )
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
}

afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    resetForegroundPulseForTests()
})

describe('useAuth', () => {
    it('reuses a stored session token without refreshing immediately', async () => {
        const futureExp = Math.floor(Date.now() / 1000) + 3600
        const storedToken = createJwt(futureExp)
        localStorage.setItem('viby_session_token::http://hub.test', storedToken)
        const fetchMock = mockHubHealth()

        const { result } = renderHook(() => useAuth({ type: 'accessToken', token: 'access-token' }, 'http://hub.test'))

        await waitFor(() => {
            expect(result.current.token).toBe(storedToken)
            expect(result.current.api).not.toBeNull()
        })
        expect(result.current.isLoading).toBe(false)
        expect(fetchMock).toHaveBeenCalledWith('http://hub.test/health', expect.any(Object))
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/auth'))).toBe(false)
    })

    it('keeps a stored session token available even when the access-token source is missing', async () => {
        const futureExp = Math.floor(Date.now() / 1000) + 3600
        const storedToken = createJwt(futureExp)
        localStorage.setItem('viby_session_token::http://hub.test', storedToken)
        mockHubHealth()

        const { result } = renderHook(() => useAuth(null, 'http://hub.test'))

        await waitFor(() => {
            expect(result.current.token).toBe(storedToken)
            expect(result.current.api).not.toBeNull()
        })
        expect(result.current.error).toBeNull()
        expect(result.current.isLoading).toBe(false)
    })
})
