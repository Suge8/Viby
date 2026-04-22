import { z } from 'zod'
import { createStaticTurnCredentialGenerator, parseCsvUrls, type TurnCredentialGenerator } from './turn'

const envSchema = z.object({
    PAIRING_HOST: z.string().optional(),
    PAIRING_PORT: z.string().optional(),
    PAIRING_PUBLIC_URL: z.string().optional(),
    PAIRING_SESSION_TTL_SECONDS: z.string().optional(),
    PAIRING_TICKET_TTL_SECONDS: z.string().optional(),
    PAIRING_RECONNECT_CHALLENGE_TTL_SECONDS: z.string().optional(),
    PAIRING_STUN_URLS: z.string().optional(),
    PAIRING_TURN_URLS: z.string().optional(),
    PAIRING_TURN_SECRET: z.string().optional(),
    PAIRING_TURN_REALM: z.string().optional(),
    PAIRING_TURN_TTL_SECONDS: z.string().optional(),
    PAIRING_REDIS_URL: z.string().optional(),
    PAIRING_CREATE_TOKEN: z.string().optional(),
    PAIRING_CREATE_LIMIT_PER_MINUTE: z.string().optional(),
    PAIRING_CLAIM_LIMIT_PER_MINUTE: z.string().optional(),
    PAIRING_RECONNECT_LIMIT_PER_MINUTE: z.string().optional(),
    PAIRING_APPROVE_LIMIT_PER_MINUTE: z.string().optional(),
})

export interface PairingBrokerConfig {
    host: string
    port: number
    publicUrl: string
    sessionTtlSeconds: number
    ticketTtlSeconds: number
    reconnectChallengeTtlSeconds: number
    stunUrls: string[]
    turnGenerator: TurnCredentialGenerator | null
    redisUrl: string | null
    createToken: string | null
    createLimitPerMinute: number
    claimLimitPerMinute: number
    reconnectLimitPerMinute: number
    approveLimitPerMinute: number
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
    if (!raw) {
        return fallback
    }

    const parsed = Number.parseInt(raw, 10)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function trimNullable(raw: string | undefined): string | null {
    const trimmed = raw?.trim()
    return trimmed ? trimmed : null
}

function getEnvRecord(): Record<string, string | undefined> {
    if (typeof process !== 'undefined' && process?.env) {
        return process.env
    }

    return Bun.env
}

export function readPairingBrokerConfig(env: Record<string, string | undefined> = getEnvRecord()): PairingBrokerConfig {
    const parsed = envSchema.parse(env)
    const host = parsed.PAIRING_HOST?.trim() || '0.0.0.0'
    const port = parsePositiveInt(parsed.PAIRING_PORT, 8787)
    const defaultPublicHost = host === '0.0.0.0' ? '127.0.0.1' : host
    const publicUrl = (parsed.PAIRING_PUBLIC_URL?.trim() || `http://${defaultPublicHost}:${port}`).replace(/\/+$/, '')
    const sessionTtlSeconds = parsePositiveInt(parsed.PAIRING_SESSION_TTL_SECONDS, 30 * 24 * 60 * 60)
    const ticketTtlSeconds = parsePositiveInt(parsed.PAIRING_TICKET_TTL_SECONDS, 10 * 60)
    const reconnectChallengeTtlSeconds = parsePositiveInt(parsed.PAIRING_RECONNECT_CHALLENGE_TTL_SECONDS, 60)
    const stunUrls = parseCsvUrls(parsed.PAIRING_STUN_URLS)
    const turnUrls = parseCsvUrls(parsed.PAIRING_TURN_URLS)
    const turnSecret = trimNullable(parsed.PAIRING_TURN_SECRET)
    const turnRealm = parsed.PAIRING_TURN_REALM?.trim() || new URL(publicUrl).host
    const turnTtlSeconds = parsePositiveInt(parsed.PAIRING_TURN_TTL_SECONDS, 10 * 60)

    const turnGenerator =
        turnUrls.length > 0 && turnSecret
            ? createStaticTurnCredentialGenerator({
                  urls: turnUrls,
                  secret: turnSecret,
                  realm: turnRealm,
                  ttlSeconds: turnTtlSeconds,
              })
            : null

    return {
        host,
        port,
        publicUrl,
        sessionTtlSeconds,
        ticketTtlSeconds,
        reconnectChallengeTtlSeconds,
        stunUrls,
        turnGenerator,
        redisUrl: trimNullable(parsed.PAIRING_REDIS_URL),
        createToken: trimNullable(parsed.PAIRING_CREATE_TOKEN),
        createLimitPerMinute: parsePositiveInt(parsed.PAIRING_CREATE_LIMIT_PER_MINUTE, 30),
        claimLimitPerMinute: parsePositiveInt(parsed.PAIRING_CLAIM_LIMIT_PER_MINUTE, 20),
        reconnectLimitPerMinute: parsePositiveInt(parsed.PAIRING_RECONNECT_LIMIT_PER_MINUTE, 60),
        approveLimitPerMinute: parsePositiveInt(parsed.PAIRING_APPROVE_LIMIT_PER_MINUTE, 30),
    }
}
