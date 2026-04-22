import { isPermissionModeAllowedForDriver, resolveSessionDriver } from '@viby/protocol'
import { PermissionModeSchema } from '@viby/protocol/schemas'
import { Hono } from 'hono'
import { z } from 'zod'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireSessionFromParam, requireSyncEngine } from './guards'
import { createJsonBodyValidator } from './sessionRouteSupport'

const decisionSchema = z.enum(['approved', 'approved_for_session', 'denied', 'abort'])

// Flat format: Record<string, string[]> (AskUserQuestion)
// Nested format: Record<string, { answers: string[] }> (request_user_input)
const answersSchema = z.union([
    z.record(z.string(), z.array(z.string())),
    z.record(z.string(), z.object({ answers: z.array(z.string()) })),
])

const approveBodySchema = z.object({
    mode: PermissionModeSchema.optional(),
    allowTools: z.array(z.string()).optional(),
    decision: decisionSchema.optional(),
    answers: answersSchema.optional(),
})

const denyBodySchema = z.object({
    decision: decisionSchema.optional(),
})

export function createPermissionsRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.post(
        '/sessions/:id/permissions/:requestId/approve',
        createJsonBodyValidator(approveBodySchema, 'Invalid body', {}),
        async (c) => {
            const engine = requireSyncEngine(c, getSyncEngine)
            if (engine instanceof Response) {
                return engine
            }

            const requestId = c.req.param('requestId')

            const sessionResult = requireSessionFromParam(c, engine, { requireActive: true })
            if (sessionResult instanceof Response) {
                return sessionResult
            }
            const { sessionId, session } = sessionResult

            const body = c.req.valid('json')

            const requests = session.agentState?.requests ?? null
            if (!requests || !requests[requestId]) {
                return c.json({ error: 'Request not found' }, 404)
            }

            const mode = body.mode
            if (mode !== undefined) {
                const driver = resolveSessionDriver(session.metadata)
                if (!driver || !isPermissionModeAllowedForDriver(mode, driver)) {
                    return c.json({ error: 'Invalid permission mode for session driver' }, 400)
                }
            }
            const allowTools = body.allowTools
            const decision = body.decision
            const answers = body.answers
            await engine.approvePermission(sessionId, requestId, mode, allowTools, decision, answers)
            return c.json({ ok: true })
        }
    )

    app.post(
        '/sessions/:id/permissions/:requestId/deny',
        createJsonBodyValidator(denyBodySchema, 'Invalid body', {}),
        async (c) => {
            const engine = requireSyncEngine(c, getSyncEngine)
            if (engine instanceof Response) {
                return engine
            }

            const requestId = c.req.param('requestId')

            const sessionResult = requireSessionFromParam(c, engine, { requireActive: true })
            if (sessionResult instanceof Response) {
                return sessionResult
            }
            const { sessionId, session } = sessionResult

            const requests = session.agentState?.requests ?? null
            if (!requests || !requests[requestId]) {
                return c.json({ error: 'Request not found' }, 404)
            }

            await engine.denyPermission(sessionId, requestId, c.req.valid('json').decision)
            return c.json({ ok: true })
        }
    )

    return app
}
