import { resolveSessionDriver, SAME_SESSION_SWITCH_TARGET_DRIVERS, SESSION_RECOVERY_PAGE_SIZE } from '@viby/protocol'
import { PermissionModeSchema } from '@viby/protocol/schemas'
import type { Context, Hono } from 'hono'
import { z } from 'zod'
import { getSessionCommandResumeStatus } from '../../sync/sessionCommandService'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import {
    createJsonBodyValidator,
    type GetSyncEngine,
    getErrorMessage,
    getErrorStatus,
    parseJsonBody,
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
const resumeBodySchema = z.object({
    permissionMode: PermissionModeSchema.optional(),
})

type SessionLifecycleAction = 'archive' | 'close' | 'unarchive'

function sessionCommandErrorResponse(
    c: Context<WebAppEnv>,
    result: { error: { message: string; code?: string; status: number } }
) {
    return c.json(
        { error: result.error.message, code: result.error.code },
        result.error.status as 400 | 404 | 409 | 500 | 503
    )
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

    const result = await sessionContext.engine.executeSessionCommand({
        type: action,
        sessionId: sessionContext.sessionId,
    })
    if (!result.ok) return sessionCommandErrorResponse(c, result)
    if (!result.session) return c.json({ error: 'Session command did not return a session' }, 500)
    return c.json({ ok: true, session: presentSessionSnapshot(result.session) })
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

        const body = await parseJsonBody(c, resumeBodySchema, 'Invalid body', {})
        if (!body.ok) {
            return body.response
        }

        const result = await sessionContext.engine.executeSessionCommand({
            type: 'resume',
            sessionId: sessionContext.sessionId,
            permissionMode: body.data.permissionMode,
        })
        if (!result.ok) return sessionCommandErrorResponse(c, result)
        if (!result.resume || result.resume.type === 'error') {
            return c.json(
                { error: 'Session resume failed', code: 'session_action_failed' },
                getSessionCommandResumeStatus('session_action_failed')
            )
        }

        const resumedSession = sessionContext.engine.getSession(result.resume.sessionId)
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
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine)
        if (sessionContext instanceof Response) {
            return sessionContext
        }

        const result = await sessionContext.engine.executeSessionCommand({
            type: 'abort',
            sessionId: sessionContext.sessionId,
        })
        if (!result.ok) return sessionCommandErrorResponse(c, result)
        if (!result.session) return c.json({ error: 'Session command did not return a session' }, 500)
        return c.json({ ok: true, session: presentSessionSnapshot(result.session) })
    })

    app.post('/sessions/:id/archive', async (c) => await handleSessionLifecycleAction(c, getSyncEngine, 'archive'))
    app.post('/sessions/:id/close', async (c) => await handleSessionLifecycleAction(c, getSyncEngine, 'close'))
    app.post('/sessions/:id/unarchive', async (c) => await handleSessionLifecycleAction(c, getSyncEngine, 'unarchive'))

    app.post('/sessions/:id/driver-switch', createJsonBodyValidator(driverSwitchSchema), async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine)
        if (sessionContext instanceof Response) {
            return sessionContext
        }
        const body = c.req.valid('json')

        const commandResult = await sessionContext.engine.executeSessionCommand({
            type: 'driver-switch',
            sessionId: sessionContext.sessionId,
            targetDriver: body.targetDriver,
        })
        const result = commandResult.driverSwitch
        if (!commandResult.ok || !result || result.type === 'error') {
            const errorResult = result?.type === 'error' ? result : commandResult.ok ? null : commandResult.driverSwitch
            return c.json(
                {
                    error:
                        errorResult?.message ??
                        (commandResult.ok ? 'Driver switch failed' : commandResult.error.message),
                    code: errorResult?.code ?? (commandResult.ok ? 'session_action_failed' : commandResult.error.code),
                    stage: errorResult?.stage,
                    targetDriver: errorResult?.targetDriver ?? body.targetDriver,
                    rollbackResult: errorResult?.rollbackResult,
                    session: errorResult?.session ? presentSessionSnapshot(errorResult.session) : null,
                },
                commandResult.ok ? 500 : commandResult.error.status
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
