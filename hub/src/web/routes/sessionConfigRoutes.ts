import {
    getLiveSessionConfigSupport,
    isModelReasoningEffortAllowedForDriver,
    getPermissionModesForDriver,
    isPermissionModeAllowedForDriver,
    resolveSessionDriver,
    supportsLiveModelReasoningEffortForDriver,
    supportsLiveModelSelectionForDriver,
    type SessionDriver
} from '@viby/protocol'
import { CodexCollaborationModeSchema, ModelReasoningEffortSchema, PermissionModeSchema } from '@viby/protocol/schemas'
import type { Hono } from 'hono'
import { z } from 'zod'
import type { WebAppEnv } from '../middleware/auth'
import {
    getErrorMessage,
    type GetSyncEngine,
    parseJsonBody,
    type SessionRouteContext,
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
    modelReasoningEffort: ModelReasoningEffortSchema.nullable()
})

type SessionConfigSnapshotError = Error & {
    code: 'session_not_found'
}

function getSessionDriver(
    session: Parameters<typeof getLiveSessionConfigSupport>[0]
): SessionDriver | null {
    return resolveSessionDriver(session.metadata)
}

function createSessionConfigSnapshotError(): SessionConfigSnapshotError {
    const error = new Error('Session snapshot unavailable after config update') as SessionConfigSnapshotError
    error.code = 'session_not_found'
    return error
}

function getSessionConfigSnapshot(
    sessionContext: SessionRouteContext
): SessionRouteContext['session'] {
    const session = sessionContext.engine.getSession(sessionContext.sessionId)
    if (!session) {
        throw createSessionConfigSnapshotError()
    }
    return session
}

async function applySessionConfigAndReturnSnapshot(
    sessionContext: SessionRouteContext,
    config: Record<string, unknown>
): Promise<SessionRouteContext['session']> {
    await sessionContext.engine.applySessionConfig(sessionContext.sessionId, config)
    return getSessionConfigSnapshot(sessionContext)
}

function isSessionConfigSnapshotError(error: unknown): error is SessionConfigSnapshotError {
    return error instanceof Error && 'code' in error && error.code === 'session_not_found'
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

        const driver = getSessionDriver(sessionContext.session)
        const liveConfigSupport = getLiveSessionConfigSupport(sessionContext.session)
        if (!liveConfigSupport.canChangePermissionMode) {
            return c.json({ error: 'Permission mode can only be changed for Viby-managed active sessions' }, 409)
        }

        const parsedBody = await parseJsonBody(c, permissionModeSchema)
        if (!parsedBody.ok) {
            return parsedBody.response
        }

        const allowedModes = driver ? getPermissionModesForDriver(driver) : []
        if (allowedModes.length === 0) {
            return c.json({ error: 'Permission mode not supported for session driver' }, 400)
        }

        if (!isPermissionModeAllowedForDriver(parsedBody.data.mode, driver)) {
            return c.json({ error: 'Invalid permission mode for session driver' }, 400)
        }

        try {
            const session = await applySessionConfigAndReturnSnapshot(sessionContext, {
                permissionMode: parsedBody.data.mode
            })
            return c.json({ ok: true, session })
        } catch (error) {
            if (isSessionConfigSnapshotError(error)) {
                return c.json({ error: error.message, code: error.code }, 500)
            }
            return c.json({ error: getErrorMessage(error, 'Failed to apply permission mode') }, 409)
        }
    })

    app.post('/sessions/:id/collaboration-mode', async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine, { requireActive: true })
        if (sessionContext instanceof Response) {
            return sessionContext
        }

        if (getSessionDriver(sessionContext.session) !== 'codex') {
            return c.json({ error: 'Collaboration mode is only supported for Codex sessions' }, 400)
        }
        if (!getLiveSessionConfigSupport(sessionContext.session).canChangeCollaborationMode) {
            return c.json({ error: 'Collaboration mode can only be changed for Viby-managed Codex sessions' }, 409)
        }

        const parsedBody = await parseJsonBody(c, collaborationModeSchema)
        if (!parsedBody.ok) {
            return parsedBody.response
        }

        try {
            const session = await applySessionConfigAndReturnSnapshot(sessionContext, {
                collaborationMode: parsedBody.data.mode
            })
            return c.json({ ok: true, session })
        } catch (error) {
            if (isSessionConfigSnapshotError(error)) {
                return c.json({ error: error.message, code: error.code }, 500)
            }
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

        const driver = getSessionDriver(sessionContext.session)
        const liveConfigSupport = getLiveSessionConfigSupport(sessionContext.session)
        if (!driver || !supportsLiveModelSelectionForDriver(driver)) {
            return c.json({ error: 'Live model selection is only supported for Claude, Codex, Gemini, and Pi sessions' }, 400)
        }
        if (!liveConfigSupport.canChangeModel) {
            return c.json({ error: 'Model selection can only be changed for Viby-managed Claude, Codex, Gemini, and Pi sessions' }, 409)
        }

        try {
            const session = await applySessionConfigAndReturnSnapshot(sessionContext, {
                model: parsedBody.data.model
            })
            return c.json({ ok: true, session })
        } catch (error) {
            if (isSessionConfigSnapshotError(error)) {
                return c.json({ error: error.message, code: error.code }, 500)
            }
            return c.json({ error: getErrorMessage(error, 'Failed to apply model') }, 409)
        }
    })

    app.post('/sessions/:id/model-reasoning-effort', async (c) => {
        const sessionContext = resolveSessionRouteContext(c, getSyncEngine, { requireActive: true })
        if (sessionContext instanceof Response) {
            return sessionContext
        }

        const driver = getSessionDriver(sessionContext.session)
        const liveConfigSupport = getLiveSessionConfigSupport(sessionContext.session)
        if (!driver || !supportsLiveModelReasoningEffortForDriver(driver)) {
            return c.json({ error: 'Live model reasoning effort is only supported for Claude, Codex, and Pi sessions' }, 400)
        }
        if (!liveConfigSupport.canChangeModelReasoningEffort) {
            return c.json({ error: 'Model reasoning effort can only be changed for Viby-managed Claude, Codex, and Pi sessions' }, 409)
        }

        const parsedBody = await parseJsonBody(c, modelReasoningEffortSchema)
        if (!parsedBody.ok) {
            return parsedBody.response
        }

        if (
            parsedBody.data.modelReasoningEffort !== null
            && !isModelReasoningEffortAllowedForDriver(parsedBody.data.modelReasoningEffort, driver)
        ) {
            return c.json({ error: 'Invalid model reasoning effort for session driver' }, 400)
        }

        try {
            const session = await applySessionConfigAndReturnSnapshot(sessionContext, {
                modelReasoningEffort: parsedBody.data.modelReasoningEffort
            })
            return c.json({ ok: true, session })
        } catch (error) {
            if (isSessionConfigSnapshotError(error)) {
                return c.json({ error: error.message, code: error.code }, 500)
            }
            return c.json({ error: getErrorMessage(error, 'Failed to apply model reasoning effort') }, 409)
        }
    })
}
