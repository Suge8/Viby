import type { Context } from 'hono'
import type { WebAppEnv } from '../middleware/auth'

const AUTH_LIMIT = 12
const AUTH_WINDOW_MS = 60_000

type Bucket = { count: number; resetAt: number }

function readClientKey(c: Context<WebAppEnv>): string {
    return (
        c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
        c.req.header('cf-connecting-ip') ||
        c.req.header('x-real-ip') ||
        'local'
    )
}

export function createAuthFailureRateLimiter(now: () => number = Date.now) {
    const buckets = new Map<string, Bucket>()

    return (c: Context<WebAppEnv>): Response | null => {
        const key = readClientKey(c)
        const current = now()
        const bucket = buckets.get(key)
        if (!bucket || current >= bucket.resetAt) {
            buckets.set(key, { count: 1, resetAt: current + AUTH_WINDOW_MS })
            return null
        }

        bucket.count += 1
        if (bucket.count <= AUTH_LIMIT) return null
        return Response.json({ error: 'Too many authentication attempts', code: 'auth_rate_limited' }, { status: 429 })
    }
}
