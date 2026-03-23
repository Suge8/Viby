import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import type { WebAppEnv } from './middleware/auth'
import { API_CORS_ALLOW_METHODS, createApiCorsMiddleware } from './server'

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
                'access-control-request-headers': 'authorization,content-type'
            }
        })

        expect(response.status).toBe(204)
        expect(response.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173')
        expect(response.headers.get('access-control-allow-methods')).toContain('PATCH')
        expect(response.headers.get('access-control-allow-headers')).toContain('authorization')
    })
})
