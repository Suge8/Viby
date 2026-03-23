import { describe, expect, it } from 'vitest'
import { normalizeServerUrl, resolveRemoteDevHubUrl, resolveServerUrlForCurrentOrigin } from '@/hooks/useServerUrl'

describe('useServerUrl helpers', () => {
    it('normalizes valid hub urls to origin', () => {
        expect(normalizeServerUrl(' http://localhost:3006/path?q=1 ')).toEqual({
            ok: true,
            value: 'http://localhost:3006',
        })
    })

    it('rewrites equivalent local loopback aliases to the current origin', () => {
        expect(
            resolveServerUrlForCurrentOrigin('http://localhost:5173', 'http://127.0.0.1:5173')
        ).toBe('http://127.0.0.1:5173')
    })

    it('keeps explicit custom hub origins unchanged when port differs', () => {
        expect(
            resolveServerUrlForCurrentOrigin('http://localhost:3007', 'http://127.0.0.1:5173')
        ).toBe('http://localhost:3007')
    })

    it('keeps explicit remote origins unchanged', () => {
        expect(
            resolveServerUrlForCurrentOrigin('https://hub.example.com', 'http://127.0.0.1:5173')
        ).toBe('https://hub.example.com')
    })

    it('derives same-host remote dev hub urls from the proxy target port', () => {
        expect(
            resolveRemoteDevHubUrl('http://100.121.243.108:5173', 'http://127.0.0.1:37173')
        ).toBe('http://100.121.243.108:37173')
    })
})
