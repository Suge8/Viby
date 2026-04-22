import type { PairingRole } from '@viby/protocol/pairing'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { hashPairingSecret } from './crypto'
import { getBearerToken, getNow } from './httpSupport'
import type { PairingHttpOptions } from './httpTypes'
import type { PairingMetricName } from './metrics'
import type { PairingStore } from './store'

type PairingIdentity = NonNullable<Awaited<ReturnType<PairingStore['getSessionByTokenHash']>>>

export function getClientAddress(c: Context): string {
    const forwardedFor = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    const realIp = c.req.header('x-real-ip')?.trim()
    const cfIp = c.req.header('cf-connecting-ip')?.trim()
    return forwardedFor || realIp || cfIp || 'unknown'
}

export function rejectPairingRequest(
    c: Context,
    options: PairingHttpOptions,
    metric: PairingMetricName,
    status: ContentfulStatusCode,
    error: string,
    headers?: Record<string, string>
): Response {
    options.metrics?.increment(metric)
    return c.json({ error }, status, headers)
}

export function enforcePairingRateLimit(
    c: Context,
    options: PairingHttpOptions,
    ruleKey: keyof NonNullable<PairingHttpOptions['rateLimitRules']>
): Response | null {
    const rule = options.rateLimitRules?.[ruleKey]
    const limiter = options.rateLimiter
    if (!rule || !limiter) {
        return null
    }

    const clientAddress = getClientAddress(c)
    const decision = limiter.check(clientAddress, rule, getNow(options.now))
    if (decision.allowed) {
        return null
    }

    options.metrics?.increment('rate_limited')
    options.logger?.warn?.(
        `[Pairing] rate limited ${rule.bucket} ip=${clientAddress} retryAfter=${decision.retryAfterSeconds}s`
    )

    return c.json(
        {
            error: 'Too many pairing requests. Please retry shortly.',
            code: 'pairing_rate_limited',
            retryAfterSeconds: decision.retryAfterSeconds,
        },
        429,
        { 'retry-after': String(decision.retryAfterSeconds) }
    )
}

export function logPairingAudit(options: PairingHttpOptions, event: string, details: Record<string, unknown>): void {
    options.logger?.info?.(`[Pairing] ${event} ${JSON.stringify(details)}`)
}

export async function requirePairingIdentity(options: {
    c: Context
    pairingId: string
    expectedRole?: PairingRole
    rejectedMetric: PairingMetricName
    missingTokenError: string
    invalidTokenError: string
    httpOptions: PairingHttpOptions
}): Promise<PairingIdentity | Response> {
    const token = getBearerToken(options.c.req.header('authorization'))
    if (!token) {
        return rejectPairingRequest(
            options.c,
            options.httpOptions,
            options.rejectedMetric,
            401,
            options.missingTokenError
        )
    }

    const identity = await options.httpOptions.store.getSessionByTokenHash(hashPairingSecret(token))
    if (
        !identity ||
        identity.session.id !== options.pairingId ||
        (options.expectedRole && identity.role !== options.expectedRole)
    ) {
        return rejectPairingRequest(
            options.c,
            options.httpOptions,
            options.rejectedMetric,
            403,
            options.invalidTokenError
        )
    }

    return identity
}
