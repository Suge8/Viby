import { SESSION_MAX_MESSAGE_PAGE_SIZE, SESSION_TIMELINE_PAGE_SIZE } from '@viby/protocol'
import { Hono } from 'hono'
import { AttachmentMetadataSchema } from '@viby/protocol/schemas'
import { z } from 'zod'
import { SessionSendMessageError, type SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireSessionFromParam, requireSyncEngine } from './guards'

const querySchema = z.object({
    limit: z.coerce.number().int().min(1).max(SESSION_MAX_MESSAGE_PAGE_SIZE).optional(),
    beforeSeq: z.coerce.number().int().min(1).optional(),
    afterSeq: z.coerce.number().int().min(0).optional()
}).refine((value) => !(value.beforeSeq !== undefined && value.afterSeq !== undefined), {
    message: 'beforeSeq and afterSeq cannot be used together'
})

const sendMessageBodySchema = z.object({
    text: z.string(),
    localId: z.string().min(1).optional(),
    attachments: z.array(AttachmentMetadataSchema).optional()
})

export function createMessagesRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/sessions/:id/messages', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) {
            return sessionResult
        }
        const sessionId = sessionResult.sessionId

        const parsed = querySchema.safeParse(c.req.query())
        if (!parsed.success) {
            return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' }, 400)
        }

        const limit = parsed.data.limit ?? SESSION_TIMELINE_PAGE_SIZE
        const beforeSeq = parsed.data.beforeSeq ?? null
        const afterSeq = parsed.data.afterSeq ?? null

        if (afterSeq !== null) {
            const messages = engine.getMessagesAfter(sessionId, { afterSeq, limit })
            return c.json({
                messages,
                page: {
                    limit,
                    beforeSeq: null,
                    nextBeforeSeq: null,
                    hasMore: false
                }
            })
        }
        return c.json(engine.getMessagesPage(sessionId, { limit, beforeSeq }))
    })

    app.post('/sessions/:id/messages', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) {
            return sessionResult
        }
        const sessionId = sessionResult.sessionId

        const body = await c.req.json().catch(() => null)
        const parsed = sendMessageBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const trimmedText = parsed.data.text.trim()
        const hasAttachments = Boolean(parsed.data.attachments && parsed.data.attachments.length > 0)

        if (!trimmedText && !hasAttachments) {
            return c.json({ error: 'Message requires text or attachments' }, 400)
        }

        try {
            const session = await engine.sendMessage(sessionId, {
                text: trimmedText,
                localId: parsed.data.localId,
                attachments: parsed.data.attachments,
                sentFrom: 'webapp'
            })
            return c.json({ ok: true, session })
        } catch (error) {
            if (error instanceof SessionSendMessageError) {
                return c.json({
                    error: error.message,
                    code: error.code
                }, { status: error.status })
            }

            throw error
        }
    })

    return app
}
