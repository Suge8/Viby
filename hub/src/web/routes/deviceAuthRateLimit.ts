import type { Context } from 'hono'
import type { WebAppEnv } from '../middleware/auth'

const WINDOW_MS = 60_000
const CLIENT_LIMIT = 8
const GLOBAL_LIMIT = 40

type Bucket = { count: number; resetAt: number }

function readClientKey(c: Context<WebAppEnv>): string {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    return forwarded || c.req.header('x-real-ip') || 'local'
}

function hitBucket(buckets: Map<string, Bucket>, key: string, limit: number, now: number): boolean {
    const bucket = buckets.get(key)
    if (!bucket || now >= bucket.resetAt) {
        buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
        return false
    }
    bucket.count += 1
    return bucket.count > limit
}

export function createDeviceAuthRateLimiter(now: () => number = Date.now) {
    const buckets = new Map<string, Bucket>()
    return (c: Context<WebAppEnv>): Response | null => {
        const current = now()
        const blocked =
            hitBucket(buckets, `client:${readClientKey(c)}`, CLIENT_LIMIT, current) ||
            hitBucket(buckets, 'global', GLOBAL_LIMIT, current)
        return blocked
            ? Response.json(
                  { error: 'Too many pairing attempts', code: 'device_pairing_rate_limited' },
                  { status: 429 }
              )
            : null
    }
}
