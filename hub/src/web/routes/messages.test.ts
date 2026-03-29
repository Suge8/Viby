import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { SessionSendMessageError, type SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createMessagesRoutes } from './messages'

function createApp(engineOverrides?: Partial<SyncEngine>) {
    const getMessagesAfterCalls: Array<{ sessionId: string; afterSeq: number; limit: number }> = []
    const getMessagesPageCalls: Array<{ sessionId: string; beforeSeq: number | null; limit: number }> = []
    const sendMessageCalls: Array<{
        sessionId: string
        payload: {
            text: string
            localId?: string | null
            attachments?: Array<{
                id: string
                filename: string
                mimeType: string
                size: number
                path: string
                previewUrl?: string
            }>
            sentFrom?: 'webapp'
        }
    }> = []

    const baseEngine = {
        getSession: () => ({ id: 'session-1', active: true }) as never,
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
        },
        sendMessage: async (sessionId: string, payload: {
            text: string
            localId?: string | null
            attachments?: Array<{
                id: string
                filename: string
                mimeType: string
                size: number
                path: string
                previewUrl?: string
            }>
            sentFrom?: 'webapp'
        }) => {
            sendMessageCalls.push({ sessionId, payload })
            return {
                id: sessionId,
                active: true,
                metadata: {
                    flavor: 'codex',
                    codexSessionId: 'thread-1',
                    lifecycleState: 'running'
                }
            } as never
        }
    }

    const engine = {
        ...baseEngine,
        ...engineOverrides
    } as SyncEngine

    const app = new Hono<WebAppEnv>()
    app.route('/api', createMessagesRoutes(() => engine))

    return { app, getMessagesAfterCalls, getMessagesPageCalls, sendMessageCalls }
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

    it('treats send as a single Hub-owned command and returns the authoritative session snapshot', async () => {
        const { app, sendMessageCalls } = createApp({
            getSession: () => ({ id: 'session-1', active: false }) as never
        })

        const response = await app.request('/api/sessions/session-1/messages', {
            method: 'POST',
            body: JSON.stringify({
                text: 'hello after close',
                localId: 'local-1'
            })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            ok: true,
            session: {
                id: 'session-1',
                active: true,
                metadata: {
                    flavor: 'codex',
                    codexSessionId: 'thread-1',
                    lifecycleState: 'running'
                }
            }
        })
        expect(sendMessageCalls).toEqual([
            {
                sessionId: 'session-1',
                payload: {
                    text: 'hello after close',
                    localId: 'local-1',
                    attachments: undefined,
                    sentFrom: 'webapp'
                }
            }
        ])
    })

    it('surfaces lifecycle errors from the Hub-owned send command', async () => {
        const { app, sendMessageCalls } = createApp({
            getSession: () => ({ id: 'session-1', active: false }) as never,
            sendMessage: async () => {
                throw new SessionSendMessageError('No machine online', 'no_machine_online', 409)
            }
        })

        const response = await app.request('/api/sessions/session-1/messages', {
            method: 'POST',
            body: JSON.stringify({
                text: 'hello after close'
            })
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'No machine online',
            code: 'no_machine_online'
        })
        expect(sendMessageCalls).toEqual([])
    })

    it('surfaces readonly conflicts from the Hub-owned send command', async () => {
        const { app, sendMessageCalls } = createApp({
            sendMessage: async () => {
                throw new SessionSendMessageError(
                    'Team member is currently under manager control',
                    'team_member_control_conflict' as never,
                    409
                )
            }
        })

        const response = await app.request('/api/sessions/session-1/messages', {
            method: 'POST',
            body: JSON.stringify({
                text: 'should be blocked'
            })
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Team member is currently under manager control',
            code: 'team_member_control_conflict'
        })
        expect(sendMessageCalls).toEqual([])
    })
})
