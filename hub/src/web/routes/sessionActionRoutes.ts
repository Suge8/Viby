import { resolveSessionDriver, SAME_SESSION_SWITCH_TARGET_DRIVERS, SESSION_RECOVERY_PAGE_SIZE } from '@viby/protocol'
import type { Context, Hono } from 'hono'
import { z } from 'zod'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import {
    createJsonBodyValidator,
    type GetSyncEngine,
    getErrorMessage,
    getErrorStatus,
    presentSessionSnapshot,
    resolveSessionRouteContext,
} from './sessionRouteSupport'
import { parseMultipartUploadBody } from './sessionUploadRouteSupport'

const uploadDeleteSchema = z.object({
    path: z.string().min(1),
})

const recoveryQuerySchema = z.object({
    afterSeq: z.coerce.number().int().min(0),
    limit: z.coerce.number().int().min(1).max(SESSION_RECOVERY_PAGE_SIZE).optional(),
})

const commandCapabilitiesQuerySchema = z.object({
    revision: z.string().min(1).optional(),
})

const driverSwitchSchema = z.object({
    targetDriver: z.enum(SAME_SESSION_SWITCH_TARGET_DRIVERS),
})

type SessionLifecycleAction = 'archiveSession' | 'closeSession' | 'unarchiveSession'

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
        return c.json({ ok: true, session: presentSessionSnapshot(session) })
    } catch (error) {
        return Response.json(
            {
                error: getErrorMessage(error, 'Session lifecycle action failed'),
            },
            { status: getErrorStatus(error) ?? 500 }
        )
    }
}

export function registerSessionActionRoutes(app: Hono<WebAppEnv>, getSyncEngine: GetSyncEngine): void {
    app.get('/sessions/:id/recovery', (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine)
        if (sessionContext instanceof Response) {
            return sessionContext
        }

        const parsed = recoveryQuerySchema.safeParse(c.req.query())
        if (!parsed.success) {
            return c.json({ error: 'Invalid query' }, 400)
        }

        const recoveryPage = sessionContext.engine.getSessionRecoveryPage(sessionContext.sessionId, {
            afterSeq: parsed.data.afterSeq,
            limit: parsed.data.limit ?? SESSION_RECOVERY_PAGE_SIZE,
        })

        return c.json({
            ...recoveryPage,
            session: presentSessionSnapshot(recoveryPage.session),
        })
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
            return c.json(
                {
                    error: 'Session snapshot unavailable after resume',
                    code: 'session_not_found',
                },
                500
            )
        }

        return c.json({ type: 'success', session: presentSessionSnapshot(resumedSession) })
    })

    app.post('/sessions/:id/upload', async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine)
        if (sessionContext instanceof Response) {
            return sessionContext
        }

        const parsedBody = await parseMultipartUploadBody(c)
        if (!parsedBody.ok) {
            return parsedBody.response
        }

        try {
            return c.json(
                await sessionContext.engine.uploadFile(
                    sessionContext.sessionId,
                    parsedBody.data.filename,
                    parsedBody.data.content,
                    parsedBody.data.mimeType
                )
            )
        } catch (error) {
            return Response.json(
                {
                    success: false,
                    error: getErrorMessage(error, 'Failed to upload file'),
                },
                { status: getErrorStatus(error) ?? 500 }
            )
        }
    })

    app.post('/sessions/:id/upload/delete', createJsonBodyValidator(uploadDeleteSchema), async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine)
        if (sessionContext instanceof Response) {
            return sessionContext
        }

        try {
            return c.json(
                await sessionContext.engine.deleteUploadFile(sessionContext.sessionId, c.req.valid('json').path)
            )
        } catch (error) {
            return Response.json(
                {
                    success: false,
                    error: getErrorMessage(error, 'Failed to delete upload'),
                },
                { status: getErrorStatus(error) ?? 500 }
            )
        }
    })

    app.post('/sessions/:id/abort', async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine, { requireActive: true })
        if (sessionContext instanceof Response) {
            return sessionContext
        }

        const session = await sessionContext.engine.abortSession(sessionContext.sessionId)
        return c.json({ ok: true, session: presentSessionSnapshot(session) })
    })

    app.post(
        '/sessions/:id/archive',
        async (c) => await handleSessionLifecycleAction(c, getSyncEngine, 'archiveSession')
    )
    app.post('/sessions/:id/close', async (c) => await handleSessionLifecycleAction(c, getSyncEngine, 'closeSession'))
    app.post(
        '/sessions/:id/unarchive',
        async (c) => await handleSessionLifecycleAction(c, getSyncEngine, 'unarchiveSession')
    )

    app.post('/sessions/:id/driver-switch', createJsonBodyValidator(driverSwitchSchema), async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine)
        if (sessionContext instanceof Response) {
            return sessionContext
        }
        const body = c.req.valid('json')

        const result = await sessionContext.engine.switchSessionDriver(sessionContext.sessionId, body.targetDriver)
        if (result.type === 'error') {
            return c.json(
                {
                    error: result.message,
                    code: result.code,
                    stage: result.stage,
                    targetDriver: result.targetDriver,
                    rollbackResult: result.rollbackResult,
                    session: result.session ? presentSessionSnapshot(result.session) : null,
                },
                result.status
            )
        }

        return c.json({
            ok: true,
            targetDriver: result.targetDriver,
            session: presentSessionSnapshot(result.session),
        })
    })

    app.get('/sessions/:id/command-capabilities', async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine)
        if (sessionContext instanceof Response) {
            return sessionContext
        }

        try {
            const agent = resolveSessionDriver(sessionContext.session.metadata) ?? 'claude'
            const parsedQuery = commandCapabilitiesQuerySchema.safeParse(c.req.query())
            if (!parsedQuery.success) {
                return c.json({ error: 'Invalid query' }, 400)
            }
            return c.json(
                await sessionContext.engine.listCommandCapabilities(
                    sessionContext.sessionId,
                    agent,
                    parsedQuery.data.revision
                )
            )
        } catch (error) {
            return c.json({
                success: false,
                error: getErrorMessage(error, 'Failed to list command capabilities'),
            })
        }
    })
}
