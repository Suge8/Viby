import { SESSION_MAX_MESSAGE_PAGE_SIZE, SESSION_TIMELINE_PAGE_SIZE } from '@viby/protocol'
import { AttachmentMetadataSchema } from '@viby/protocol/schemas'
import type { AttachmentMetadata } from '@viby/protocol/types'
import { Hono } from 'hono'
import { z } from 'zod'
import { SessionSendMessageError, type SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireSessionFromParam, requireSyncEngine } from './guards'
import { createJsonBodyValidator, presentSessionSnapshot } from './sessionRouteSupport'

const querySchema = z
    .object({
        limit: z.coerce.number().int().min(1).max(SESSION_MAX_MESSAGE_PAGE_SIZE).optional(),
        beforeSeq: z.coerce.number().int().min(1).optional(),
        afterSeq: z.coerce.number().int().min(0).optional(),
    })
    .refine((value) => !(value.beforeSeq !== undefined && value.afterSeq !== undefined), {
        message: 'beforeSeq and afterSeq cannot be used together',
    })

const sendMessageBodyBaseSchema = z.object({
    text: z.string(),
    localId: z.string().min(1).optional(),
    attachments: z.array(z.unknown()).optional(),
})

type SendMessageBody = {
    text: string
    localId?: string
    attachments?: AttachmentMetadata[]
}

function parseAttachmentMetadataList(value: unknown[] | undefined): AttachmentMetadata[] | null | undefined {
    if (value === undefined) {
        return undefined
    }

    const attachments: AttachmentMetadata[] = []
    for (const entry of value) {
        const parsed = AttachmentMetadataSchema.safeParse(entry)
        if (!parsed.success) {
            return null
        }
        attachments.push(parsed.data)
    }
    return attachments
}

const sendMessageBodySchema = {
    safeParse(value: unknown): { success: true; data: SendMessageBody } | { success: false } {
        const parsed = sendMessageBodyBaseSchema.safeParse(value)
        if (!parsed.success) {
            return { success: false }
        }

        const attachments = parseAttachmentMetadataList(parsed.data.attachments)
        if (attachments === null) {
            return { success: false }
        }

        return {
            success: true,
            data: {
                text: parsed.data.text,
                localId: parsed.data.localId,
                attachments,
            },
        }
    },
}

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
                    hasMore: false,
                },
            })
        }
        return c.json(engine.getMessagesPage(sessionId, { limit, beforeSeq }))
    })

    app.post('/sessions/:id/messages', createJsonBodyValidator(sendMessageBodySchema), async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) {
            return sessionResult
        }
        const sessionId = sessionResult.sessionId

        const body = c.req.valid('json')

        const trimmedText = body.text.trim()
        const hasAttachments = Boolean(body.attachments && body.attachments.length > 0)

        if (!trimmedText && !hasAttachments) {
            return c.json({ error: 'Message requires text or attachments' }, 400)
        }

        try {
            const session = await engine.sendMessage(sessionId, {
                text: trimmedText,
                localId: body.localId,
                attachments: body.attachments,
                sentFrom: 'webapp',
            })
            return c.json({ ok: true, session: presentSessionSnapshot(session) })
        } catch (error) {
            if (error instanceof SessionSendMessageError) {
                return c.json(
                    {
                        error: error.message,
                        code: error.code,
                    },
                    { status: error.status }
                )
            }

            throw error
        }
    })

    return app
}
