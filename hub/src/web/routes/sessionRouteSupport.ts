import { resolveSessionInteractivity } from '@viby/protocol'
import type { Context, Hono } from 'hono'
import { validator } from 'hono/validator'
import type { Session, SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireSessionFromParam, requireSyncEngine } from './guards'

type SafeParseResult<T> = { success: true; data: T } | { success: false }

type SafeParseSchema<T> = {
    safeParse: (value: unknown) => SafeParseResult<T>
}

export type SessionRouteContext = {
    engine: SyncEngine
    sessionId: string
    session: Session
}

export type GetSyncEngine = () => SyncEngine | null

export function resolveSyncEngine(c: Context<WebAppEnv>, getSyncEngine: GetSyncEngine): SyncEngine | Response {
    return requireSyncEngine(c, getSyncEngine)
}

export function resolveSessionRouteContext(
    c: Context<WebAppEnv>,
    getSyncEngine: GetSyncEngine,
    options?: { requireActive?: boolean }
): SessionRouteContext | Response {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) {
        return engine
    }

    const sessionResult = requireSessionFromParam(c, engine, { requireActive: options?.requireActive })
    if (sessionResult instanceof Response) {
        return sessionResult
    }

    return {
        engine,
        sessionId: sessionResult.sessionId,
        session: sessionResult.session,
    }
}

export async function parseJsonBody<T>(
    c: Context,
    schema: SafeParseSchema<T>,
    errorMessage: string = 'Invalid body',
    fallbackBody: unknown = null
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
    const parsed = schema.safeParse(await readJsonBodyOrNull(c, fallbackBody))
    if (!parsed.success) {
        return {
            ok: false,
            response: c.json({ error: errorMessage }, 400),
        }
    }

    return {
        ok: true,
        data: parsed.data,
    }
}

async function readJsonBodyOrNull(
    c: { req: { json: () => Promise<unknown> } },
    fallbackBody: unknown
): Promise<unknown> {
    try {
        return await c.req.json()
    } catch {
        return fallbackBody
    }
}

export function createJsonBodyValidator<T>(
    schema: SafeParseSchema<T>,
    errorMessage: string = 'Invalid body',
    fallbackBody: unknown = null
) {
    return validator('json', async (_value, c) => {
        const parsed = await parseJsonBody(c, schema, errorMessage, fallbackBody)
        if (!parsed.ok) {
            return parsed.response
        }
        return parsed.data
    })
}

export function getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback
}

export function getErrorStatus(error: unknown): number | null {
    if (typeof error !== 'object' || error === null || !('status' in error)) {
        return null
    }

    const status = (error as { status?: unknown }).status
    return typeof status === 'number' ? status : null
}

export function presentSessionSnapshot<TSession extends Session>(
    session: TSession
): TSession & {
    resumeAvailable: boolean
} {
    return {
        ...session,
        resumeAvailable: resolveSessionInteractivity(session).resumeAvailable,
    }
}

export function registerSessionRoutes(app: Hono<WebAppEnv>, register: (app: Hono<WebAppEnv>) => void): void {
    register(app)
}
