import {
    compareSessionSummaries,
    getSessionMessageActivityFromSession,
    presentSessionWithResumeAvailability,
    resolveSessionInteractivity,
    SESSION_TIMELINE_PAGE_SIZE,
    toSessionSummary,
} from '@viby/protocol'
import type { SessionStreamState } from '@viby/protocol/types'
import { Hono } from 'hono'
import { z } from 'zod'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireSessionFromParam, requireSyncEngine } from './guards'
import { MAX_RESUMABLE_SESSIONS_LIMIT, ResumableSessionsReadModel } from './resumableSessionsReadModel'
import { registerSessionActionRoutes } from './sessionActionRoutes'
import { registerSessionConfigRoutes } from './sessionConfigRoutes'
import { createJsonBodyValidator, getErrorMessage, getErrorStatus, presentSessionSnapshot } from './sessionRouteSupport'

const renameSessionSchema = z.object({
    name: z.string().min(1).max(255),
})

const resumableSessionsQuerySchema = z.object({
    driver: z.enum(['claude', 'codex', 'gemini', 'opencode', 'cursor', 'pi']).optional(),
    query: z.string().trim().optional(),
    lifecycle: z.enum(['closed', 'all']).optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().positive().max(MAX_RESUMABLE_SESSIONS_LIMIT).optional(),
    revision: z.string().min(1).optional(),
})

function deriveLatestSeq(messages: ReadonlyArray<{ seq: number | null }>): number {
    let latestSeq = 0
    for (const message of messages) {
        if (typeof message.seq === 'number' && message.seq > latestSeq) {
            latestSeq = message.seq
        }
    }
    return latestSeq
}

export function createSessionsRoutes(
    getSyncEngine: () => SyncEngine | null,
    getSessionStream?: (sessionId: string) => SessionStreamState | null
): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()
    const resumableReadModel = new ResumableSessionsReadModel()

    app.get('/sessions', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const baseSessions = engine.getSessions()
        const sessions = baseSessions
            .map((session) => toSessionSummary(session, getSessionMessageActivityFromSession(session)))
            .sort(compareSessionSummaries)

        return c.json({ sessions })
    })

    app.get('/sessions/resumable', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const parsed = resumableSessionsQuerySchema.safeParse(c.req.query())
        if (!parsed.success) {
            return c.json({ error: 'Invalid query' }, 400)
        }

        const snapshot = resumableReadModel.getSnapshot(engine, parsed.data)
        if (parsed.data.revision === snapshot.revision) {
            return c.json({
                revision: snapshot.revision,
                notModified: true,
            })
        }

        return c.json(snapshot)
    })

    app.get('/sessions/:id', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) {
            return sessionResult
        }

        return c.json({ session: presentSessionSnapshot(sessionResult.session) })
    })

    app.get('/sessions/:id/view', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) {
            return sessionResult
        }

        const latestWindow = engine.getMessagesPage(sessionResult.sessionId, {
            limit: SESSION_TIMELINE_PAGE_SIZE,
            beforeSeq: null,
        })
        const session = presentSessionWithResumeAvailability(sessionResult.session)
        return c.json({
            session,
            latestWindow,
            stream: getSessionStream?.(sessionResult.sessionId) ?? null,
            watermark: {
                latestSeq: deriveLatestSeq(latestWindow.messages),
                updatedAt: session.updatedAt,
            },
            interactivity: resolveSessionInteractivity(session),
        })
    })

    app.patch(
        '/sessions/:id',
        createJsonBodyValidator(renameSessionSchema, 'Invalid body: name is required'),
        async (c) => {
            const engine = requireSyncEngine(c, getSyncEngine)
            if (engine instanceof Response) {
                return engine
            }

            const sessionResult = requireSessionFromParam(c, engine)
            if (sessionResult instanceof Response) {
                return sessionResult
            }

            try {
                const session = await engine.renameSession(sessionResult.sessionId, c.req.valid('json').name)
                return c.json({ session: presentSessionSnapshot(session) })
            } catch (error) {
                const message = getErrorMessage(error, 'Failed to rename session')
                // Map concurrency/version errors to 409 conflict
                if (message.includes('concurrently') || message.includes('version')) {
                    return c.json({ error: message }, 409)
                }
                return c.json({ error: message }, 500)
            }
        }
    )

    app.delete('/sessions/:id', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) {
            return engine
        }

        const sessionResult = requireSessionFromParam(c, engine)
        if (sessionResult instanceof Response) {
            return sessionResult
        }

        if (sessionResult.session.active) {
            return c.json({ error: 'Cannot delete active session. Archive it first.' }, 409)
        }

        try {
            await engine.deleteSession(sessionResult.sessionId)
            return c.json({ ok: true })
        } catch (error) {
            const message = getErrorMessage(error, 'Failed to delete session')
            // Map lifecycle conflicts to 409 and preserve not-found semantics.
            if (message.includes('active')) {
                return c.json({ error: message }, 409)
            }
            const status = getErrorStatus(error)
            if (status === 404 || status === 409) {
                return c.json({ error: message }, status)
            }
            return c.json({ error: message }, 500)
        }
    })

    registerSessionActionRoutes(app, getSyncEngine)
    registerSessionConfigRoutes(app, getSyncEngine)

    return app
}
