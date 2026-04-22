import {
    isPermissionModeAllowedForDriver,
    ListAgentAvailabilityRequestSchema,
    LocalSessionCatalogRequestSchema,
    LocalSessionExportRequestSchema,
    ResolveAgentLaunchConfigRequestSchema,
} from '@viby/protocol'
import {
    CodexCollaborationModeSchema,
    ModelReasoningEffortSchema,
    PermissionModeSchema,
    SessionDriverSchema,
} from '@viby/protocol/schemas'
import { type Context, Hono } from 'hono'
import { z } from 'zod'
import { resolveLocalRuntime } from '../../runtime/localRuntimeIdentity'
import type { Machine, SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireSyncEngine } from './guards'
import { createJsonBodyValidator } from './sessionRouteSupport'

const spawnBodySchema = z.object({
    directory: z.string().min(1),
    agent: SessionDriverSchema.optional(),
    model: z.string().optional(),
    modelReasoningEffort: ModelReasoningEffortSchema.optional(),
    permissionMode: PermissionModeSchema.optional(),
    collaborationMode: CodexCollaborationModeSchema.optional(),
    sessionType: z.enum(['simple', 'worktree']).optional(),
    worktreeName: z.string().optional(),
})

const pathsExistsSchema = z.object({
    paths: z.array(z.string().min(1)).max(1000),
})

const browseDirectoryQuerySchema = z.object({
    path: z.string().optional(),
})

function getLocalRuntime(engine: SyncEngine): Machine | null {
    return resolveLocalRuntime(engine.getMachines())
}

async function getRuntimeAgentAvailability(options: {
    engine: SyncEngine
    machineId: string
    directory?: string
    forceRefresh?: boolean
}) {
    return await options.engine.listAgentAvailability(options.machineId, {
        directory: options.directory,
        forceRefresh: options.forceRefresh,
    })
}

function requireActiveLocalRuntime(c: Context<WebAppEnv>, engine: SyncEngine): Machine | Response {
    const runtime = getLocalRuntime(engine)
    if (!runtime?.active) {
        return c.json({ error: 'Local runtime unavailable' }, 409)
    }
    return runtime
}

export function createRuntimeRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/runtime', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        return c.json({ runtime: getLocalRuntime(engine) })
    })

    app.get('/runtime/agent-availability', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const runtime = requireActiveLocalRuntime(c, engine)
        if (runtime instanceof Response) {
            return runtime
        }

        const parsed = ListAgentAvailabilityRequestSchema.safeParse(c.req.query())
        if (!parsed.success) {
            return c.json({ error: 'Invalid query' }, 400)
        }

        return c.json(
            await getRuntimeAgentAvailability({
                engine,
                machineId: runtime.id,
                directory: parsed.data.directory,
                forceRefresh: parsed.data.forceRefresh,
            })
        )
    })

    app.post('/runtime/spawn', createJsonBodyValidator(spawnBodySchema), async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const runtime = requireActiveLocalRuntime(c, engine)
        if (runtime instanceof Response) {
            return runtime
        }

        const body = c.req.valid('json')

        const agent = body.agent ?? 'claude'
        if (body.permissionMode && !isPermissionModeAllowedForDriver(body.permissionMode, agent)) {
            return c.json({ error: 'Invalid permission mode for session driver' }, 400)
        }
        if (body.collaborationMode && agent !== 'codex') {
            return c.json({ error: 'Collaboration mode is only supported for Codex sessions' }, 400)
        }

        const availability = await getRuntimeAgentAvailability({
            engine,
            machineId: runtime.id,
            directory: body.directory,
        })
        const selectedAgentAvailability = availability.agents.find((candidate) => candidate.driver === agent)
        if (!selectedAgentAvailability || selectedAgentAvailability.status !== 'ready') {
            return c.json(
                {
                    error: selectedAgentAvailability?.reason ?? 'Selected agent is unavailable on this machine',
                    code: 'agent_unavailable',
                    agent,
                    availability: selectedAgentAvailability ?? null,
                },
                409
            )
        }

        const result = await engine.spawnSession({
            machineId: runtime.id,
            directory: body.directory,
            agent,
            model: body.model,
            modelReasoningEffort: body.modelReasoningEffort,
            permissionMode: body.permissionMode,
            sessionType: body.sessionType,
            worktreeName: body.worktreeName,
            collaborationMode: body.collaborationMode,
        })
        if (result.type !== 'success') {
            return c.json(result)
        }

        const session = await engine.ensureSessionDriver(result.sessionId, agent, {
            model: body.model ?? null,
        })
        if (!session) {
            return c.json(
                {
                    error: 'Session snapshot unavailable after spawn',
                    code: 'session_not_found',
                },
                500
            )
        }

        return c.json({ type: 'success', session })
    })

    app.post('/runtime/paths/exists', createJsonBodyValidator(pathsExistsSchema), async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const runtime = requireActiveLocalRuntime(c, engine)
        if (runtime instanceof Response) {
            return runtime
        }

        const body = c.req.valid('json')
        const uniquePaths = Array.from(new Set(body.paths.map((path) => path.trim()).filter(Boolean)))
        if (uniquePaths.length === 0) {
            return c.json({ exists: {} })
        }

        try {
            const exists = await engine.checkPathsExist(runtime.id, uniquePaths)
            return c.json({ exists })
        } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : 'Failed to check paths' }, 500)
        }
    })

    app.post(
        '/runtime/agent-launch-config',
        createJsonBodyValidator(ResolveAgentLaunchConfigRequestSchema),
        async (c) => {
            const engine = requireSyncEngine(c, getSyncEngine)
            if (engine instanceof Response) {
                return engine
            }

            const runtime = requireActiveLocalRuntime(c, engine)
            if (runtime instanceof Response) {
                return runtime
            }

            return c.json(await engine.resolveAgentLaunchConfig(runtime.id, c.req.valid('json')))
        }
    )

    app.get('/runtime/local-sessions', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const runtime = requireActiveLocalRuntime(c, engine)
        if (runtime instanceof Response) {
            return runtime
        }

        const parsed = LocalSessionCatalogRequestSchema.safeParse(c.req.query())
        if (!parsed.success) {
            return c.json({ error: 'Invalid query' }, 400)
        }

        return c.json(await engine.listLocalSessions(runtime.id, parsed.data))
    })

    app.post('/runtime/local-sessions/import', createJsonBodyValidator(LocalSessionExportRequestSchema), async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const runtime = requireActiveLocalRuntime(c, engine)
        if (runtime instanceof Response) {
            return runtime
        }

        return c.json(await engine.importLocalSession(runtime.id, c.req.valid('json')))
    })

    app.get('/runtime/directory', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const runtime = requireActiveLocalRuntime(c, engine)
        if (runtime instanceof Response) {
            return runtime
        }

        const parsed = browseDirectoryQuerySchema.safeParse(c.req.query())
        if (!parsed.success) {
            return c.json({ error: 'Invalid query' }, 400)
        }

        try {
            return c.json(await engine.browseMachineDirectory(runtime.id, parsed.data.path))
        } catch (error) {
            return c.json(
                { success: false, error: error instanceof Error ? error.message : 'Failed to browse directory' },
                500
            )
        }
    })

    return app
}
