import { PROTOCOL_VERSION, SESSION_RECOVERY_PAGE_SIZE } from '@viby/protocol'
import { CodexCollaborationModeSchema, ModelReasoningEffortSchema, PermissionModeSchema } from '@viby/protocol/schemas'
import { Hono } from 'hono'
import { z } from 'zod'
import { configuration } from '../../configuration'
import { isLocalRuntimeRegistration, resolveLocalRuntime } from '../../runtime/localRuntimeIdentity'
import type { Machine, Session, SyncEngine } from '../../sync/syncEngine'
import { parseAccessToken } from '../../utils/accessToken'
import { constantTimeEquals } from '../../utils/crypto'
import { createJsonBodyValidator } from './sessionRouteSupport'

const bearerSchema = z.string().regex(/^Bearer\s+(.+)$/i)

const createOrLoadSessionSchema = z.object({
    tag: z.string().min(1),
    sessionId: z.string().uuid().optional(),
    metadata: z.unknown(),
    agentState: z.unknown().nullable().optional(),
    model: z.string().optional(),
    modelReasoningEffort: ModelReasoningEffortSchema.optional(),
    permissionMode: PermissionModeSchema.optional(),
    collaborationMode: CodexCollaborationModeSchema.optional(),
})

const createOrLoadMachineSchema = z.object({
    id: z.string().min(1),
    metadata: z.unknown(),
    runnerState: z.unknown().nullable().optional(),
})

const getMessagesQuerySchema = z.object({
    afterSeq: z.coerce.number().int().min(0),
    limit: z.coerce.number().int().min(1).max(SESSION_RECOVERY_PAGE_SIZE).optional(),
})

type CliEnv = {
    Variables: {}
}

function resolveSession(
    engine: SyncEngine,
    sessionId: string
): { ok: true; session: Session; sessionId: string } | { ok: false; status: 404; error: string } {
    const session = engine.getSession(sessionId)
    if (session) {
        return { ok: true, session, sessionId }
    }
    return { ok: false, status: 404, error: 'Session not found' }
}

function resolveMachine(
    engine: SyncEngine,
    machineId: string
): { ok: true; machine: Machine } | { ok: false; status: 404; error: string } {
    const machine = engine.getMachine(machineId)
    if (machine) {
        return { ok: true, machine }
    }
    return { ok: false, status: 404, error: 'Machine not found' }
}

export function createCliRoutes(getSyncEngine: () => SyncEngine | null): Hono<CliEnv> {
    const app = new Hono<CliEnv>()

    app.use('*', async (c, next) => {
        c.header('X-Viby-Protocol-Version', String(PROTOCOL_VERSION))

        const raw = c.req.header('authorization')
        if (!raw) {
            return c.json({ error: 'Missing Authorization header' }, 401)
        }

        const parsed = bearerSchema.safeParse(raw)
        if (!parsed.success) {
            return c.json({ error: 'Invalid Authorization header' }, 401)
        }

        const token = parsed.data.replace(/^Bearer\s+/i, '')
        const parsedToken = parseAccessToken(token)
        if (!parsedToken || !constantTimeEquals(parsedToken, configuration.cliApiToken)) {
            return c.json({ error: 'Invalid token' }, 401)
        }

        return await next()
    })

    app.post('/sessions', createJsonBodyValidator(createOrLoadSessionSchema), async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }
        const body = c.req.valid('json')

        const session = engine.getOrCreateSession({
            tag: body.tag,
            metadata: body.metadata,
            agentState: body.agentState ?? null,
            model: body.model,
            modelReasoningEffort: body.modelReasoningEffort,
            permissionMode: body.permissionMode,
            collaborationMode: body.collaborationMode,
            sessionId: body.sessionId,
        })
        return c.json({ session })
    })

    app.get('/sessions/:id', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }
        const sessionId = c.req.param('id')
        const resolved = resolveSession(engine, sessionId)
        if (!resolved.ok) {
            return c.json({ error: resolved.error }, resolved.status)
        }
        return c.json({ session: resolved.session })
    })

    app.get('/sessions/:id/messages', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }
        const sessionId = c.req.param('id')
        const resolved = resolveSession(engine, sessionId)
        if (!resolved.ok) {
            return c.json({ error: resolved.error }, resolved.status)
        }

        const parsed = getMessagesQuerySchema.safeParse(c.req.query())
        if (!parsed.success) {
            return c.json({ error: 'Invalid query' }, 400)
        }

        const limit = parsed.data.limit ?? SESSION_RECOVERY_PAGE_SIZE
        const messages = engine.getMessagesAfter(resolved.sessionId, { afterSeq: parsed.data.afterSeq, limit })
        return c.json({ messages })
    })

    app.get('/sessions/:id/recovery', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }
        const sessionId = c.req.param('id')
        const resolved = resolveSession(engine, sessionId)
        if (!resolved.ok) {
            return c.json({ error: resolved.error }, resolved.status)
        }

        const parsed = getMessagesQuerySchema.safeParse(c.req.query())
        if (!parsed.success) {
            return c.json({ error: 'Invalid query' }, 400)
        }

        const limit = parsed.data.limit ?? SESSION_RECOVERY_PAGE_SIZE
        return c.json(
            engine.getSessionRecoveryPage(resolved.sessionId, {
                afterSeq: parsed.data.afterSeq,
                limit,
            })
        )
    })

    app.post('/machines', createJsonBodyValidator(createOrLoadMachineSchema), async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }
        const body = c.req.valid('json')

        if (!isLocalRuntimeRegistration(body.metadata)) {
            return c.json({ error: 'This Hub only accepts its local runtime' }, 409)
        }

        const activeRuntime = resolveLocalRuntime(engine.getOnlineMachines())
        if (activeRuntime && activeRuntime.id !== body.id) {
            return c.json({ error: 'Local runtime is already connected' }, 409)
        }

        const machine = engine.getOrCreateMachine(body.id, body.metadata, body.runnerState ?? null)
        return c.json({ machine })
    })

    app.get('/machines/:id', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not ready' }, 503)
        }
        const machineId = c.req.param('id')
        const resolved = resolveMachine(engine, machineId)
        if (!resolved.ok) {
            return c.json({ error: resolved.error }, resolved.status)
        }
        return c.json({ machine: resolved.machine })
    })

    return app
}
