import {
    CodexCollaborationModeSchema,
    CodexServiceTierSchema,
    ModelReasoningEffortSchema,
    PermissionModeSchema,
} from '@viby/protocol/schemas'
import type { Hono } from 'hono'
import { z } from 'zod'
import type { WebAppEnv } from '../middleware/auth'
import {
    createJsonBodyValidator,
    type GetSyncEngine,
    getErrorMessage,
    getErrorStatus,
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

function getConfigErrorStatus(error: unknown): ConfigErrorStatus {
    const status = getErrorStatus(error)
    return status === 400 || status === 404 || status === 409 || status === 500 || status === 503 ? status : 409
}

function getConfigErrorPayload(error: unknown, fallback: string): { error: string; code?: string } {
    const payload: { error: string; code?: string } = { error: getErrorMessage(error, fallback) }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'session_not_found') {
        payload.code = error.code
    }
    return payload
}

export function registerSessionConfigRoutes(app: Hono<WebAppEnv>, getSyncEngine: GetSyncEngine): void {
    app.post('/sessions/:id/permission-mode', createJsonBodyValidator(permissionModeSchema), async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine)
        if (sessionContext instanceof Response) return sessionContext

        try {
            const session = await sessionContext.engine.setPermissionMode(
                sessionContext.sessionId,
                c.req.valid('json').mode
            )
            return c.json({ ok: true, session: presentSessionSnapshot(session) })
        } catch (error) {
            return c.json(getConfigErrorPayload(error, 'Failed to apply permission mode'), getConfigErrorStatus(error))
        }
    })

    app.post('/sessions/:id/collaboration-mode', createJsonBodyValidator(collaborationModeSchema), async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine)
        if (sessionContext instanceof Response) return sessionContext

        try {
            const session = await sessionContext.engine.setCollaborationMode(
                sessionContext.sessionId,
                c.req.valid('json').mode
            )
            return c.json({ ok: true, session: presentSessionSnapshot(session) })
        } catch (error) {
            return c.json(
                getConfigErrorPayload(error, 'Failed to apply collaboration mode'),
                getConfigErrorStatus(error)
            )
        }
    })

    app.post('/sessions/:id/model', createJsonBodyValidator(modelSchema), async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine)
        if (sessionContext instanceof Response) return sessionContext

        try {
            const session = await sessionContext.engine.setModel(sessionContext.sessionId, c.req.valid('json').model)
            return c.json({ ok: true, session: presentSessionSnapshot(session) })
        } catch (error) {
            return c.json(getConfigErrorPayload(error, 'Failed to apply model'), getConfigErrorStatus(error))
        }
    })

    app.post('/sessions/:id/model-reasoning-effort', createJsonBodyValidator(modelReasoningEffortSchema), async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine)
        if (sessionContext instanceof Response) return sessionContext

        try {
            const session = await sessionContext.engine.setModelReasoningEffort(
                sessionContext.sessionId,
                c.req.valid('json').modelReasoningEffort
            )
            return c.json({ ok: true, session: presentSessionSnapshot(session) })
        } catch (error) {
            return c.json(
                getConfigErrorPayload(error, 'Failed to apply model reasoning effort'),
                getConfigErrorStatus(error)
            )
        }
    })

    app.post('/sessions/:id/codex-service-tier', createJsonBodyValidator(codexServiceTierSchema), async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine)
        if (sessionContext instanceof Response) return sessionContext

        try {
            const session = await sessionContext.engine.setCodexServiceTier(
                sessionContext.sessionId,
                c.req.valid('json').codexServiceTier
            )
            return c.json({ ok: true, session: presentSessionSnapshot(session) })
        } catch (error) {
            return c.json(getConfigErrorPayload(error, 'Failed to apply Codex fast mode'), getConfigErrorStatus(error))
        }
    })
}
