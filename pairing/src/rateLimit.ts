export interface PairingRateLimitRule {
    bucket: string
    limit: number
    windowMs: number
}

export interface PairingRateLimitDecision {
    allowed: boolean
    retryAfterSeconds: number
    remaining: number
}

export class PairingRateLimiter {
    private readonly buckets = new Map<string, number[]>()

    check(key: string, rule: PairingRateLimitRule, now: number): PairingRateLimitDecision {
        const bucketKey = `${rule.bucket}:${key}`
        const windowStart = now - rule.windowMs
        const timestamps = (this.buckets.get(bucketKey) ?? []).filter((timestamp) => timestamp > windowStart)

        if (timestamps.length >= rule.limit) {
            const retryAfterMs = Math.max(1_000, rule.windowMs - (now - timestamps[0]!))
            this.buckets.set(bucketKey, timestamps)
            return {
                allowed: false,
                retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
                remaining: 0,
            }
        }

        timestamps.push(now)
        this.buckets.set(bucketKey, timestamps)
        return {
            allowed: true,
            retryAfterSeconds: 0,
            remaining: Math.max(0, rule.limit - timestamps.length),
        }
    }
}
