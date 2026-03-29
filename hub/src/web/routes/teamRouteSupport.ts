import type { Context } from 'hono'
import type { z } from 'zod'
import {
    SessionSendMessageError,
    TeamAcceptanceError,
    TeamMemberControlError,
    TeamLifecycleError,
    TeamOrchestrationError,
    type SyncEngine
} from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireSyncEngine } from './guards'

export function requireTeamSyncEngine(
    c: Context<WebAppEnv>,
    getSyncEngine: () => SyncEngine | null
): SyncEngine | Response {
    return requireSyncEngine(c, getSyncEngine)
}

function handleTeamActionError(c: Context<WebAppEnv>, error: unknown): Response | null {
    if (error instanceof SessionSendMessageError) {
        return c.json({
            error: error.message,
            code: error.code
        }, { status: error.status })
    }
    if (error instanceof TeamMemberControlError) {
        return c.json({
            error: error.message,
            code: error.code
        }, { status: error.status })
    }
    if (error instanceof TeamAcceptanceError) {
        return c.json({
            error: error.message,
            code: error.code
        }, { status: error.status })
    }
    if (error instanceof TeamLifecycleError) {
        return c.json({
            error: error.message,
            code: error.code
        }, { status: error.status })
    }
    if (error instanceof TeamOrchestrationError) {
        return c.json({
            error: error.message,
            code: error.code
        }, { status: error.status })
    }

    return null
}

async function parseJsonBody<T>(
    c: Context<WebAppEnv>,
    schema: z.ZodType<T>
): Promise<T | Response> {
    const body = await c.req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
        return c.json({ error: 'Invalid body' }, 400)
    }
    return parsed.data
}

function respondMissingProject(c: Context<WebAppEnv>): Response {
    return c.json({ error: 'Team project not found', code: 'team_project_not_found' }, 404)
}

export async function readTeamProjectResource<T>(
    c: Context<WebAppEnv>,
    getSyncEngine: () => SyncEngine | null,
    read: (engine: SyncEngine) => Promise<T | null> | T | null
): Promise<Response> {
    const engine = requireTeamSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) {
        return engine
    }

    const resource = await read(engine)
    if (!resource) {
        return respondMissingProject(c)
    }

    return c.json(resource)
}

export async function executeTeamAction<TResult>(
    c: Context<WebAppEnv>,
    getSyncEngine: () => SyncEngine | null,
    execute: (engine: SyncEngine) => Promise<TResult>
): Promise<Response> {
    const engine = requireTeamSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) {
        return engine
    }

    try {
        return c.json(await execute(engine))
    } catch (error) {
        const handled = handleTeamActionError(c, error)
        if (handled) {
            return handled
        }

        throw error
    }
}

export async function executeTeamActionWithBody<TBody, TResult>(
    c: Context<WebAppEnv>,
    getSyncEngine: () => SyncEngine | null,
    schema: z.ZodType<TBody>,
    execute: (engine: SyncEngine, body: TBody) => Promise<TResult>
): Promise<Response> {
    const engine = requireTeamSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) {
        return engine
    }

    const parsed = await parseJsonBody(c, schema)
    if (parsed instanceof Response) {
        return parsed
    }

    try {
        return c.json(await execute(engine, parsed))
    } catch (error) {
        const handled = handleTeamActionError(c, error)
        if (handled) {
            return handled
        }

        throw error
    }
}
