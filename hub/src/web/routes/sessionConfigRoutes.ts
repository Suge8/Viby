import {
    getLiveSessionConfigSupport,
    getPermissionModesForFlavor,
    isPermissionModeAllowedForFlavor
} from '@viby/protocol'
import { CodexCollaborationModeSchema, CodexReasoningEffortSchema, PermissionModeSchema } from '@viby/protocol/schemas'
import type { Hono } from 'hono'
import { z } from 'zod'
import type { WebAppEnv } from '../middleware/auth'
import {
    getErrorMessage,
    type GetSyncEngine,
    parseJsonBody,
    resolveSessionRouteContext
} from './sessionRouteSupport'

const permissionModeSchema = z.object({
    mode: PermissionModeSchema
})

const collaborationModeSchema = z.object({
    mode: CodexCollaborationModeSchema
})

const modelSchema = z.object({
    model: z.string().trim().min(1).nullable()
})

const modelReasoningEffortSchema = z.object({
    modelReasoningEffort: CodexReasoningEffortSchema.nullable()
})

function getSessionFlavor(
    session: Parameters<typeof getLiveSessionConfigSupport>[0]
): string {
    return session.metadata?.flavor ?? 'claude'
}

export function registerSessionConfigRoutes(
    app: Hono<WebAppEnv>,
    getSyncEngine: GetSyncEngine
): void {
    app.post('/sessions/:id/permission-mode', async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine, { requireActive: true })
        if (sessionContext instanceof Response) {
            return sessionContext
        }

        const flavor = getSessionFlavor(sessionContext.session)
        const liveConfigSupport = getLiveSessionConfigSupport(sessionContext.session)
        if (!liveConfigSupport.canChangePermissionMode) {
            return c.json({ error: 'Permission mode can only be changed for remote-managed active sessions' }, 409)
        }

        const parsedBody = await parseJsonBody(c, permissionModeSchema)
        if (!parsedBody.ok) {
            return parsedBody.response
        }

        const allowedModes = getPermissionModesForFlavor(flavor)
        if (allowedModes.length === 0) {
            return c.json({ error: 'Permission mode not supported for session flavor' }, 400)
        }

        if (!isPermissionModeAllowedForFlavor(parsedBody.data.mode, flavor)) {
            return c.json({ error: 'Invalid permission mode for session flavor' }, 400)
        }

        try {
            await sessionContext.engine.applySessionConfig(sessionContext.sessionId, {
                permissionMode: parsedBody.data.mode
            })
            return c.json({ ok: true })
        } catch (error) {
            return c.json({ error: getErrorMessage(error, 'Failed to apply permission mode') }, 409)
        }
    })

    app.post('/sessions/:id/collaboration-mode', async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine, { requireActive: true })
        if (sessionContext instanceof Response) {
            return sessionContext
        }

        if (getSessionFlavor(sessionContext.session) !== 'codex') {
            return c.json({ error: 'Collaboration mode is only supported for Codex sessions' }, 400)
        }
        if (!getLiveSessionConfigSupport(sessionContext.session).canChangeCollaborationMode) {
            return c.json({ error: 'Collaboration mode can only be changed for remote Codex sessions' }, 409)
        }

        const parsedBody = await parseJsonBody(c, collaborationModeSchema)
        if (!parsedBody.ok) {
            return parsedBody.response
        }

        try {
            await sessionContext.engine.applySessionConfig(sessionContext.sessionId, {
                collaborationMode: parsedBody.data.mode
            })
            return c.json({ ok: true })
        } catch (error) {
            return c.json({ error: getErrorMessage(error, 'Failed to apply collaboration mode') }, 409)
        }
    })

    app.post('/sessions/:id/model', async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine, { requireActive: true })
        if (sessionContext instanceof Response) {
            return sessionContext
        }

        const parsedBody = await parseJsonBody(c, modelSchema)
        if (!parsedBody.ok) {
            return parsedBody.response
        }

        const flavor = getSessionFlavor(sessionContext.session)
        const liveConfigSupport = getLiveSessionConfigSupport(sessionContext.session)
        if (flavor !== 'codex') {
            return c.json({ error: 'Live model selection is only supported for Codex sessions' }, 400)
        }
        if (!liveConfigSupport.canChangeModel) {
            return c.json({ error: 'Model selection can only be changed for remote Codex sessions' }, 409)
        }

        try {
            await sessionContext.engine.applySessionConfig(sessionContext.sessionId, {
                model: parsedBody.data.model
            })
            return c.json({ ok: true })
        } catch (error) {
            return c.json({ error: getErrorMessage(error, 'Failed to apply model') }, 409)
        }
    })

    app.post('/sessions/:id/model-reasoning-effort', async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine, { requireActive: true })
        if (sessionContext instanceof Response) {
            return sessionContext
        }

        const flavor = getSessionFlavor(sessionContext.session)
        const liveConfigSupport = getLiveSessionConfigSupport(sessionContext.session)
        if (flavor !== 'codex') {
            return c.json({ error: 'Live model reasoning effort is only supported for Codex sessions' }, 400)
        }
        if (!liveConfigSupport.canChangeModelReasoningEffort) {
            return c.json({ error: 'Model reasoning effort can only be changed for remote Codex sessions' }, 409)
        }

        const parsedBody = await parseJsonBody(c, modelReasoningEffortSchema)
        if (!parsedBody.ok) {
            return parsedBody.response
        }

        try {
            await sessionContext.engine.applySessionConfig(sessionContext.sessionId, {
                modelReasoningEffort: parsedBody.data.modelReasoningEffort
            })
            return c.json({ ok: true })
        } catch (error) {
            return c.json({ error: getErrorMessage(error, 'Failed to apply model reasoning effort') }, 409)
        }
    })
}
