import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createMessagesRoutes } from './messages'

function createApp() {
    const getMessagesAfterCalls: Array<{ sessionId: string; afterSeq: number; limit: number }> = []
    const getMessagesPageCalls: Array<{ sessionId: string; beforeSeq: number | null; limit: number }> = []

    const engine = {
        getSession: () => ({ id: 'session-1', active: true }),
        getMessagesAfter: (sessionId: string, options: { afterSeq: number; limit: number }) => {
            getMessagesAfterCalls.push({ sessionId, afterSeq: options.afterSeq, limit: options.limit })
            return [
                {
                    id: 'message-6',
                    seq: 6,
                    localId: null,
                    createdAt: 6_000,
                    content: {
                        role: 'assistant',
                        content: {
                            type: 'text',
                            text: 'caught up'
                        }
                    }
                }
            ]
        },
        getMessagesPage: (sessionId: string, options: { beforeSeq: number | null; limit: number }) => {
            getMessagesPageCalls.push({ sessionId, beforeSeq: options.beforeSeq, limit: options.limit })
            return {
                messages: [],
                page: {
                    limit: options.limit,
                    beforeSeq: options.beforeSeq,
                    nextBeforeSeq: null,
                    hasMore: false
                }
            }
        }
    } as unknown as Partial<SyncEngine>

    const app = new Hono<WebAppEnv>()
    app.route('/api', createMessagesRoutes(() => engine as SyncEngine))

    return { app, getMessagesAfterCalls, getMessagesPageCalls }
}

describe('messages routes', () => {
    it('uses store-backed afterSeq catchup when afterSeq is provided', async () => {
        const { app, getMessagesAfterCalls, getMessagesPageCalls } = createApp()

        const response = await app.request('/api/sessions/session-1/messages?afterSeq=5&limit=20')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            messages: [
                {
                    id: 'message-6',
                    seq: 6,
                    localId: null,
                    createdAt: 6_000,
                    content: {
                        role: 'assistant',
                        content: {
                            type: 'text',
                            text: 'caught up'
                        }
                    }
                }
            ],
            page: {
                limit: 20,
                beforeSeq: null,
                nextBeforeSeq: null,
                hasMore: false
            }
        })
        expect(getMessagesAfterCalls).toEqual([
            { sessionId: 'session-1', afterSeq: 5, limit: 20 }
        ])
        expect(getMessagesPageCalls).toEqual([])
    })

    it('rejects invalid query combinations instead of silently falling back to default paging', async () => {
        const { app, getMessagesAfterCalls, getMessagesPageCalls } = createApp()

        const response = await app.request('/api/sessions/session-1/messages?afterSeq=5&beforeSeq=4')

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({
            error: 'beforeSeq and afterSeq cannot be used together'
        })
        expect(getMessagesAfterCalls).toEqual([])
        expect(getMessagesPageCalls).toEqual([])
    })
})
