import { SESSION_RECOVERY_PAGE_SIZE } from '@viby/protocol'
import type { Context, Hono } from 'hono'
import { z } from 'zod'
import {
    TeamLifecycleError,
    type SyncEngine
} from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import {
    getErrorMessage,
    type GetSyncEngine,
    parseJsonBody,
    resolveSessionRouteContext,
    resolveSyncEngine
} from './sessionRouteSupport'

const uploadSchema = z.object({
    filename: z.string().min(1).max(255),
    content: z.string().min(1),
    mimeType: z.string().min(1).max(255)
})

const uploadDeleteSchema = z.object({
    path: z.string().min(1)
})

const recoveryQuerySchema = z.object({
    afterSeq: z.coerce.number().int().min(0),
    limit: z.coerce.number().int().min(1).max(SESSION_RECOVERY_PAGE_SIZE).optional()
})

type SessionLifecycleAction = 'archiveSession' | 'closeSession' | 'unarchiveSession'

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

function getBase64Padding(base64: string): number {
    if (base64.endsWith('==')) {
        return 2
    }
    if (base64.endsWith('=')) {
        return 1
    }

    return 0
}

function estimateBase64Bytes(base64: string): number {
    const len = base64.length
    if (len === 0) {
        return 0
    }

    return Math.floor((len * 3) / 4) - getBase64Padding(base64)
}

function getResumeErrorStatus(code: string): 404 | 409 | 500 | 503 {
    switch (code) {
        case 'no_machine_online':
            return 503
        case 'session_not_found':
            return 404
        case 'session_archived':
            return 409
        default:
            return 500
    }
}

async function handleSessionLifecycleAction(
    c: Context<WebAppEnv>,
    getSyncEngine: GetSyncEngine,
    action: SessionLifecycleAction
): Promise<Response> {
    const sessionContext = resolveSessionRouteContext(c, getSyncEngine)
    if (sessionContext instanceof Response) {
        return sessionContext
    }

    try {
        const session = await sessionContext.engine[action](sessionContext.sessionId)
        return c.json({ ok: true, session })
    } catch (error) {
        if (error instanceof TeamLifecycleError) {
            return c.json({
                error: error.message,
                code: error.code
            }, error.status)
        }

        throw error
    }
}

export function registerSessionActionRoutes(
    app: Hono<WebAppEnv>,
    getSyncEngine: GetSyncEngine
): void {
    app.get('/sessions/:id/recovery', (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine)
        if (sessionContext instanceof Response) {
            return sessionContext
        }

        const parsed = recoveryQuerySchema.safeParse(c.req.query())
        if (!parsed.success) {
            return c.json({ error: 'Invalid query' }, 400)
        }

        return c.json(sessionContext.engine.getSessionRecoveryPage(sessionContext.sessionId, {
            afterSeq: parsed.data.afterSeq,
            limit: parsed.data.limit ?? SESSION_RECOVERY_PAGE_SIZE
        }))
    })

    app.post('/sessions/:id/resume', async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine)
        if (sessionContext instanceof Response) {
            return sessionContext
        }

        const result = await sessionContext.engine.resumeSession(sessionContext.sessionId)
        if (result.type === 'error') {
            return c.json({ error: result.message, code: result.code }, getResumeErrorStatus(result.code))
        }

        const resumedSession = sessionContext.engine.getSession(result.sessionId)
        if (!resumedSession) {
            return c.json({
                error: 'Session snapshot unavailable after resume',
                code: 'session_not_found'
            }, 500)
        }

        return c.json({ type: 'success', session: resumedSession })
    })

    app.post('/sessions/:id/upload', async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine, { requireActive: true })
        if (sessionContext instanceof Response) {
            return sessionContext
        }

        const parsedBody = await parseJsonBody(c, uploadSchema)
        if (!parsedBody.ok) {
            return parsedBody.response
        }

        if (estimateBase64Bytes(parsedBody.data.content) > MAX_UPLOAD_BYTES) {
            return c.json({ success: false, error: 'File too large (max 50MB)' }, 413)
        }

        try {
            return c.json(await sessionContext.engine.uploadFile(
                sessionContext.sessionId,
                parsedBody.data.filename,
                parsedBody.data.content,
                parsedBody.data.mimeType
            ))
        } catch (error) {
            return c.json({
                success: false,
                error: getErrorMessage(error, 'Failed to upload file')
            }, 500)
        }
    })

    app.post('/sessions/:id/upload/delete', async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine, { requireActive: true })
        if (sessionContext instanceof Response) {
            return sessionContext
        }

        const parsedBody = await parseJsonBody(c, uploadDeleteSchema)
        if (!parsedBody.ok) {
            return parsedBody.response
        }

        try {
            return c.json(await sessionContext.engine.deleteUploadFile(
                sessionContext.sessionId,
                parsedBody.data.path
            ))
        } catch (error) {
            return c.json({
                success: false,
                error: getErrorMessage(error, 'Failed to delete upload')
            }, 500)
        }
    })

    app.post('/sessions/:id/abort', async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine, { requireActive: true })
        if (sessionContext instanceof Response) {
            return sessionContext
        }

        const session = await sessionContext.engine.abortSession(sessionContext.sessionId)
        return c.json({ ok: true, session })
    })

    app.post('/sessions/:id/archive', async (c) => await handleSessionLifecycleAction(c, getSyncEngine, 'archiveSession'))
    app.post('/sessions/:id/close', async (c) => await handleSessionLifecycleAction(c, getSyncEngine, 'closeSession'))
    app.post('/sessions/:id/unarchive', async (c) => await handleSessionLifecycleAction(c, getSyncEngine, 'unarchiveSession'))

    app.post('/sessions/:id/switch', async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine, { requireActive: true })
        if (sessionContext instanceof Response) {
            return sessionContext
        }

        const session = await sessionContext.engine.switchSession(sessionContext.sessionId, 'remote')
        return c.json({ ok: true, session })
    })

    app.get('/sessions/:id/slash-commands', async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine)
        if (sessionContext instanceof Response) {
            return sessionContext
        }

        try {
            const agent = sessionContext.session.metadata?.flavor ?? 'claude'
            return c.json(await sessionContext.engine.listSlashCommands(sessionContext.sessionId, agent))
        } catch (error) {
            return c.json({
                success: false,
                error: getErrorMessage(error, 'Failed to list slash commands')
            })
        }
    })

    app.get('/sessions/:id/skills', async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine)
        if (sessionContext instanceof Response) {
            return sessionContext
        }

        try {
            return c.json(await sessionContext.engine.listSkills(sessionContext.sessionId))
        } catch (error) {
            return c.json({
                success: false,
                error: getErrorMessage(error, 'Failed to list skills')
            })
        }
    })
}
