import { Hono } from 'hono'
import { z } from 'zod'
import { isPermissionModeAllowedForFlavor } from '@viby/protocol'
import {
    CodexCollaborationModeSchema,
    ModelReasoningEffortSchema,
    PermissionModeSchema
} from '@viby/protocol/schemas'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireMachine } from './guards'

const spawnBodySchema = z.object({
    directory: z.string().min(1),
    agent: z.enum(['claude', 'codex', 'cursor', 'gemini', 'opencode']).optional(),
    model: z.string().optional(),
    modelReasoningEffort: ModelReasoningEffortSchema.optional(),
    permissionMode: PermissionModeSchema.optional(),
    collaborationMode: CodexCollaborationModeSchema.optional(),
    sessionType: z.enum(['simple', 'worktree']).optional(),
    worktreeName: z.string().optional()
})

const pathsExistsSchema = z.object({
    paths: z.array(z.string().min(1)).max(1000)
})

const browseDirectoryQuerySchema = z.object({
    path: z.string().optional()
})

export function createMachinesRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/machines', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machines = engine.getOnlineMachines()
        return c.json({ machines })
    })

    app.post('/machines/:id/spawn', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        const body = await c.req.json().catch(() => null)
        const parsed = spawnBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const agent = parsed.data.agent ?? 'claude'
        if (parsed.data.permissionMode && !isPermissionModeAllowedForFlavor(parsed.data.permissionMode, agent)) {
            return c.json({ error: 'Invalid permission mode for agent flavor' }, 400)
        }
        if (parsed.data.collaborationMode && agent !== 'codex') {
            return c.json({ error: 'Collaboration mode is only supported for Codex sessions' }, 400)
        }

        const result = await engine.spawnSession({
            machineId,
            directory: parsed.data.directory,
            agent,
            model: parsed.data.model,
            modelReasoningEffort: parsed.data.modelReasoningEffort,
            permissionMode: parsed.data.permissionMode,
            sessionType: parsed.data.sessionType,
            worktreeName: parsed.data.worktreeName,
            collaborationMode: parsed.data.collaborationMode
        })
        if (result.type !== 'success') {
            return c.json(result)
        }

        const session = engine.getSession(result.sessionId)
        if (!session) {
            return c.json({
                error: 'Session snapshot unavailable after spawn',
                code: 'session_not_found'
            }, 500)
        }

        return c.json({
            type: 'success',
            session
        })
    })

    app.post('/machines/:id/paths/exists', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        const body = await c.req.json().catch(() => null)
        const parsed = pathsExistsSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const uniquePaths = Array.from(new Set(parsed.data.paths.map((path) => path.trim()).filter(Boolean)))
        if (uniquePaths.length === 0) {
            return c.json({ exists: {} })
        }

        try {
            const exists = await engine.checkPathsExist(machineId, uniquePaths)
            return c.json({ exists })
        } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : 'Failed to check paths' }, 500)
        }
    })

    app.get('/machines/:id/directory', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        const parsed = browseDirectoryQuerySchema.safeParse(c.req.query())
        if (!parsed.success) {
            return c.json({ error: 'Invalid query' }, 400)
        }

        try {
            return c.json(await engine.browseMachineDirectory(machineId, parsed.data.path))
        } catch (error) {
            return c.json({ success: false, error: error instanceof Error ? error.message : 'Failed to browse directory' }, 500)
        }
    })

    return app
}
