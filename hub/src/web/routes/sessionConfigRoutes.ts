import {
    CodexCollaborationModeSchema,
    CodexServiceTierSchema,
    ModelReasoningEffortSchema,
    PermissionModeSchema,
} from '@viby/protocol/schemas'
import type { Hono } from 'hono'
import { z } from 'zod'
import type { SessionCommandResult } from '../../sync/sessionCommandService'
import type { WebAppEnv } from '../middleware/auth'
import {
    createJsonBodyValidator,
    type GetSyncEngine,
    presentSessionSnapshot,
    resolveSessionRouteContext,
} from './sessionRouteSupport'

const permissionModeSchema = z.object({
    mode: PermissionModeSchema,
})

const collaborationModeSchema = z.object({
    mode: CodexCollaborationModeSchema,
})

const modelSchema = z.object({
    model: z.string().trim().min(1).nullable(),
})

const modelReasoningEffortSchema = z.object({
    modelReasoningEffort: ModelReasoningEffortSchema.nullable(),
})

const codexServiceTierSchema = z.object({
    codexServiceTier: CodexServiceTierSchema.nullable(),
})

type ConfigErrorStatus = 400 | 404 | 409 | 500 | 503

type ConfigCommandResult = SessionCommandResult

function getConfigErrorResponse(
    result: Extract<ConfigCommandResult, { ok: false }>
): [{ error: string; code?: string }, ConfigErrorStatus] {
    const payload: { error: string; code?: string } = { error: result.error.message }
    if (result.error.code === 'session_not_found') payload.code = result.error.code
    return [payload, result.error.status]
}

function getConfigSuccessResponse(result: Extract<ConfigCommandResult, { ok: true }>) {
    if (!result.session) {
        return { ok: false as const, error: 'Session command did not return a session' }
    }
    return { ok: true as const, session: presentSessionSnapshot(result.session) }
}

export function registerSessionConfigRoutes(app: Hono<WebAppEnv>, getSyncEngine: GetSyncEngine): void {
    app.post('/sessions/:id/permission-mode', createJsonBodyValidator(permissionModeSchema), async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine)
        if (sessionContext instanceof Response) return sessionContext

        const result = await sessionContext.engine.executeSessionCommand({
            type: 'permission-mode',
            sessionId: sessionContext.sessionId,
            mode: c.req.valid('json').mode,
        })
        return result.ok ? c.json(getConfigSuccessResponse(result)) : c.json(...getConfigErrorResponse(result))
    })

    app.post('/sessions/:id/collaboration-mode', createJsonBodyValidator(collaborationModeSchema), async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine)
        if (sessionContext instanceof Response) return sessionContext

        const result = await sessionContext.engine.executeSessionCommand({
            type: 'collaboration-mode',
            sessionId: sessionContext.sessionId,
            mode: c.req.valid('json').mode,
        })
        return result.ok ? c.json(getConfigSuccessResponse(result)) : c.json(...getConfigErrorResponse(result))
    })

    app.post('/sessions/:id/model', createJsonBodyValidator(modelSchema), async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine)
        if (sessionContext instanceof Response) return sessionContext

        const result = await sessionContext.engine.executeSessionCommand({
            type: 'model',
            sessionId: sessionContext.sessionId,
            model: c.req.valid('json').model,
        })
        return result.ok ? c.json(getConfigSuccessResponse(result)) : c.json(...getConfigErrorResponse(result))
    })

    app.post('/sessions/:id/model-reasoning-effort', createJsonBodyValidator(modelReasoningEffortSchema), async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine)
        if (sessionContext instanceof Response) return sessionContext

        const result = await sessionContext.engine.executeSessionCommand({
            type: 'model-reasoning-effort',
            sessionId: sessionContext.sessionId,
            modelReasoningEffort: c.req.valid('json').modelReasoningEffort,
        })
        return result.ok ? c.json(getConfigSuccessResponse(result)) : c.json(...getConfigErrorResponse(result))
    })

    app.post('/sessions/:id/codex-service-tier', createJsonBodyValidator(codexServiceTierSchema), async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine)
        if (sessionContext instanceof Response) return sessionContext

        const result = await sessionContext.engine.executeSessionCommand({
            type: 'codex-service-tier',
            sessionId: sessionContext.sessionId,
            codexServiceTier: c.req.valid('json').codexServiceTier,
        })
        return result.ok ? c.json(getConfigSuccessResponse(result)) : c.json(...getConfigErrorResponse(result))
    })
}
