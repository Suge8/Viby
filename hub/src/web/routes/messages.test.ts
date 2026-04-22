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
                            text: 'caught up',
                        },
                    },
                },
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
                    hasMore: false,
                },
            }
        },
        sendMessage: async (
            sessionId: string,
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
        ) => {
            sendMessageCalls.push({ sessionId, payload })
            return {
                id: sessionId,
                active: true,
                metadata: {
                    flavor: 'codex',
                    codexSessionId: 'thread-1',
                    lifecycleState: 'running',
                },
            } as never
        },
    }

    const engine = {
        ...baseEngine,
        ...engineOverrides,
    } as SyncEngine

    const app = new Hono<WebAppEnv>()
    app.route(
        '/api',
        createMessagesRoutes(() => engine)
    )

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
                            text: 'caught up',
                        },
                    },
                },
            ],
            page: {
                limit: 20,
                beforeSeq: null,
                nextBeforeSeq: null,
                hasMore: false,
            },
        })
        expect(getMessagesAfterCalls).toEqual([{ sessionId: 'session-1', afterSeq: 5, limit: 20 }])
        expect(getMessagesPageCalls).toEqual([])
    })

    it('rejects invalid query combinations instead of silently falling back to default paging', async () => {
        const { app, getMessagesAfterCalls, getMessagesPageCalls } = createApp()

        const response = await app.request('/api/sessions/session-1/messages?afterSeq=5&beforeSeq=4')

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({
            error: 'beforeSeq and afterSeq cannot be used together',
        })
        expect(getMessagesAfterCalls).toEqual([])
        expect(getMessagesPageCalls).toEqual([])
    })

    it('trims non-empty text and treats send as a single Hub-owned command', async () => {
        const { app, sendMessageCalls } = createApp({
            getSession: () => ({ id: 'session-1', active: false }) as never,
        })

        const response = await app.request('/api/sessions/session-1/messages', {
            method: 'POST',
            body: JSON.stringify({
                text: '  hello after close  ',
                localId: 'local-1',
            }),
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            session: {
                id: 'session-1',
                active: true,
                resumeAvailable: false,
                metadata: {
                    flavor: 'codex',
                    codexSessionId: 'thread-1',
                    lifecycleState: 'running',
                },
            },
        })
        expect(sendMessageCalls).toEqual([
            {
                sessionId: 'session-1',
                payload: {
                    text: 'hello after close',
                    localId: 'local-1',
                    attachments: undefined,
                    sentFrom: 'webapp',
                },
            },
        ])
    })

    it('rejects whitespace-only text when no attachments are present', async () => {
        const { app, sendMessageCalls } = createApp()

        const response = await app.request('/api/sessions/session-1/messages', {
            method: 'POST',
            body: JSON.stringify({
                text: '   ',
            }),
        })

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({
            error: 'Message requires text or attachments',
        })
        expect(sendMessageCalls).toEqual([])
    })

    it('preserves attachment-only sends after trimming blank text', async () => {
        const { app, sendMessageCalls } = createApp()
        const attachment = {
            id: 'attachment-1',
            filename: 'spec.txt',
            mimeType: 'text/plain',
            size: 42,
            path: '/tmp/spec.txt',
        }

        const response = await app.request('/api/sessions/session-1/messages', {
            method: 'POST',
            body: JSON.stringify({
                text: '   ',
                attachments: [attachment],
            }),
        })

        expect(response.status).toBe(200)
        expect(sendMessageCalls).toEqual([
            {
                sessionId: 'session-1',
                payload: {
                    text: '',
                    localId: undefined,
                    attachments: [attachment],
                    sentFrom: 'webapp',
                },
            },
        ])
    })

    it('surfaces lifecycle errors from the Hub-owned send command', async () => {
        const { app, sendMessageCalls } = createApp({
            getSession: () => ({ id: 'session-1', active: false }) as never,
            sendMessage: async () => {
                throw new SessionSendMessageError('No machine online', 'no_machine_online', 409)
            },
        })

        const response = await app.request('/api/sessions/session-1/messages', {
            method: 'POST',
            body: JSON.stringify({
                text: 'hello after close',
            }),
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'No machine online',
            code: 'no_machine_online',
        })
        expect(sendMessageCalls).toEqual([])
    })

    it('surfaces send conflicts from the Hub-owned send command', async () => {
        const { app, sendMessageCalls } = createApp({
            sendMessage: async () => {
                throw new SessionSendMessageError('Session is read-only', 'session_readonly' as never, 409)
            },
        })

        const response = await app.request('/api/sessions/session-1/messages', {
            method: 'POST',
            body: JSON.stringify({
                text: 'should be blocked',
            }),
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Session is read-only',
            code: 'session_readonly',
        })
        expect(sendMessageCalls).toEqual([])
    })

    it('blocks lifecycle-owned slash commands before they hit the send path', async () => {
        const { app, sendMessageCalls } = createApp({
            sendMessage: async () => {
                throw new SessionSendMessageError(
                    'This command is managed by Viby. Use New Session instead.',
                    'command_use_new_session',
                    409
                )
            },
        })

        const response = await app.request('/api/sessions/session-1/messages', {
            method: 'POST',
            body: JSON.stringify({
                text: '/new',
                localId: 'local-2',
            }),
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'This command is managed by Viby. Use New Session instead.',
            code: 'command_use_new_session',
        })
        expect(sendMessageCalls).toEqual([])
    })

    it('keeps hand-typed resume commands behind the authoritative History and Recover Local paths', async () => {
        const { app, sendMessageCalls } = createApp({
            sendMessage: async () => {
                throw new SessionSendMessageError(
                    'This command is managed by Viby. Open History for Hub-managed chats, or use New Session → Recover Local for local sessions Viby has not imported yet.',
                    'command_requires_lifecycle_owner',
                    409
                )
            },
        })

        const response = await app.request('/api/sessions/session-1/messages', {
            method: 'POST',
            body: JSON.stringify({
                text: '/resume previous-chat',
                localId: 'local-3',
            }),
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'This command is managed by Viby. Open History for Hub-managed chats, or use New Session → Recover Local for local sessions Viby has not imported yet.',
            code: 'command_requires_lifecycle_owner',
        })
        expect(sendMessageCalls).toEqual([])
    })
})
