import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import type { Session, SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createSessionsRoutes } from './sessions'

function createInactiveSession(): Session {
    return {
        id: 'session-1',
        active: false,
        metadata: {
            path: '/tmp/project',
            host: 'localhost',
            driver: 'codex',
        },
    } as Session
}

describe('session action routes', () => {
    it('accepts attachment uploads and deletions for inactive sessions', async () => {
        const session = createInactiveSession()
        const uploadFileCalls: Array<[string, string, string, string]> = []
        const deleteUploadFileCalls: Array<[string, string]> = []
        const engine = {
            getSession: (sessionId: string) => (sessionId === session.id ? session : undefined),
            uploadFile: async (sessionId: string, filename: string, content: string, mimeType: string) => {
                uploadFileCalls.push([sessionId, filename, content, mimeType])
                return { success: true, path: '/tmp/uploaded.png' }
            },
            deleteUploadFile: async (sessionId: string, path: string) => {
                deleteUploadFileCalls.push([sessionId, path])
                return { success: true }
            },
        } as Partial<SyncEngine>

        const app = new Hono<WebAppEnv>()
        app.route(
            '/api',
            createSessionsRoutes(() => engine as SyncEngine)
        )

        const formData = new FormData()
        formData.append('file', new File(['abc'], 'photo.png', { type: 'image/png' }))
        formData.append('mimeType', 'image/png')

        const uploadResponse = await app.request('/api/sessions/session-1/upload', {
            method: 'POST',
            body: formData,
        })

        expect(uploadResponse.status).toBe(200)
        expect(await uploadResponse.json()).toEqual({
            success: true,
            path: '/tmp/uploaded.png',
        })
        expect(uploadFileCalls).toEqual([['session-1', 'photo.png', 'YWJj', 'image/png']])

        const deleteResponse = await app.request('/api/sessions/session-1/upload/delete', {
            method: 'POST',
            body: JSON.stringify({
                path: '/tmp/uploaded.png',
            }),
        })

        expect(deleteResponse.status).toBe(200)
        expect(await deleteResponse.json()).toEqual({ success: true })
        expect(deleteUploadFileCalls).toEqual([['session-1', '/tmp/uploaded.png']])
    })

    it('rejects legacy JSON attachment uploads so Web and Hub stay on one multipart path', async () => {
        const session = createInactiveSession()
        const engine = {
            getSession: (sessionId: string) => (sessionId === session.id ? session : undefined),
            uploadFile: async () => {
                throw new Error('should not be called')
            },
        } as Partial<SyncEngine>

        const app = new Hono<WebAppEnv>()
        app.route(
            '/api',
            createSessionsRoutes(() => engine as SyncEngine)
        )

        const response = await app.request('/api/sessions/session-1/upload', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                filename: 'photo.png',
                content: 'YWJj',
                mimeType: 'image/png',
            }),
        })

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({ error: 'Invalid body' })
    })
})
