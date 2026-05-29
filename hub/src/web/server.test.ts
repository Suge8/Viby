import { describe, expect, it } from 'bun:test'
import { SESSION_ATTACHMENT_MAX_UPLOAD_BYTES } from '@viby/protocol'
import { Hono } from 'hono'
import type { WebAppEnv } from './middleware/auth'
import { API_CORS_ALLOW_METHODS, createApiCorsMiddleware, resolveWebServerMaxRequestBodySize } from './server'

describe('web server max request body size', () => {
    it('lifts the socket.io 1MB cap to fit the attachment ceiling so paste uploads stop hitting 413', () => {
        // socket.io bun-engine default `maxHttpBufferSize` is 1e6 (1 MB).
        // Adopting that verbatim made every multipart upload over 1 MB
        // respond with 413, which is exactly the screenshot/paste case the
        // composer surface exposes. The HTTP body cap must therefore at
        // least cover the published attachment upload ceiling.
        const resolved = resolveWebServerMaxRequestBodySize(1_000_000)
        expect(resolved).toBeGreaterThan(SESSION_ATTACHMENT_MAX_UPLOAD_BYTES)
        expect(resolved).toBeGreaterThanOrEqual(1_000_000)
    })

    it('preserves a larger socket.io request body size if the engine has been retuned upwards', () => {
        const larger = SESSION_ATTACHMENT_MAX_UPLOAD_BYTES * 4
        expect(resolveWebServerMaxRequestBodySize(larger)).toBe(larger)
    })
})

describe('web server CORS middleware', () => {
    it('keeps the shared API CORS method list aligned with current cross-origin API verbs', () => {
        expect(API_CORS_ALLOW_METHODS).toEqual(['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'])
    })

    it('answers cross-origin PATCH preflight requests with PATCH in allow-methods', async () => {
        const app = new Hono<WebAppEnv>()
        app.use('/api/*', createApiCorsMiddleware(['http://127.0.0.1:5173']))
        app.patch('/api/sessions/:id', (c) => c.json({ ok: true }))

        const response = await app.request('/api/sessions/session-1', {
            method: 'OPTIONS',
            headers: {
                origin: 'http://127.0.0.1:5173',
                'access-control-request-method': 'PATCH',
                'access-control-request-headers': 'authorization,content-type',
            },
        })

        expect(response.status).toBe(204)
        expect(response.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173')
        expect(response.headers.get('access-control-allow-methods')).toContain('PATCH')
        expect(response.headers.get('access-control-allow-headers')).toContain('authorization')
    })

    it('allows cross-origin health checks used by Web protocol compatibility', async () => {
        const app = new Hono<WebAppEnv>()
        app.use('/health', createApiCorsMiddleware(['http://127.0.0.1:5173']))
        app.get('/health', (c) => c.json({ ok: true }))

        const response = await app.request('/health', {
            headers: {
                origin: 'http://127.0.0.1:5173',
            },
        })

        expect(response.status).toBe(200)
        expect(response.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173')
    })
})
