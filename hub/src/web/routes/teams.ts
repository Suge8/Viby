import {
    Context,
    Hono
} from 'hono'
import { z } from 'zod'
import {
    TeamMemberControlError,
    type SyncEngine
} from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireSyncEngine } from './guards'

const interjectBodySchema = z.object({
    text: z.string().trim().min(1),
    localId: z.string().min(1).optional()
})

function handleTeamMemberControlError(c: Context<WebAppEnv>, error: unknown): Response | null {
    if (error instanceof TeamMemberControlError) {
        return c.json({
            error: error.message,
            code: error.code
        }, { status: error.status })
    }

    return null
}

export function createTeamsRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/team-projects/:projectId', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const snapshot = engine.getTeamProjectSnapshot(c.req.param('projectId'))
        if (!snapshot) {
            return c.json({ error: 'Team project not found', code: 'team_project_not_found' }, 404)
        }

        return c.json(snapshot)
    })

    app.post('/team-members/:memberId/interject', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const body = await c.req.json().catch(() => null)
        const parsed = interjectBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        try {
            const session = await engine.interjectTeamMember(c.req.param('memberId'), parsed.data)
            return c.json({ ok: true, session })
        } catch (error) {
            const handled = handleTeamMemberControlError(c, error)
            if (handled) {
                return handled
            }

            throw error
        }
    })

    app.post('/team-members/:memberId/takeover', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        try {
            const session = await engine.takeOverTeamMember(c.req.param('memberId'))
            return c.json({ ok: true, session })
        } catch (error) {
            const handled = handleTeamMemberControlError(c, error)
            if (handled) {
                return handled
            }

            throw error
        }
    })

    app.post('/team-members/:memberId/return', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        try {
            const session = await engine.returnTeamMember(c.req.param('memberId'))
            return c.json({ ok: true, session })
        } catch (error) {
            const handled = handleTeamMemberControlError(c, error)
            if (handled) {
                return handled
            }

            throw error
        }
    })

    return app
}
