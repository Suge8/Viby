import {
    PAIRING_HANDOFF_TICKET_TTL_SECONDS,
    PAIRING_MOBILE_DISCONNECT_GRACE_SECONDS,
    PAIRING_RECONNECT_CHALLENGE_TTL_SECONDS,
    PAIRING_SESSION_TTL_SECONDS,
} from '@viby/protocol/pairing'
import { z } from 'zod'
import { parseCsvUrls } from './iceServers'

const envSchema = z.object({
    PAIRING_HOST: z.string().optional(),
    PAIRING_PORT: z.string().optional(),
    PAIRING_PUBLIC_URL: z.string().optional(),
    PAIRING_SESSION_TTL_SECONDS: z.string().optional(),
    PAIRING_HANDOFF_TICKET_TTL_SECONDS: z.string().optional(),
    PAIRING_RECONNECT_CHALLENGE_TTL_SECONDS: z.string().optional(),
    PAIRING_DISCONNECT_GRACE_SECONDS: z.string().optional(),
    PAIRING_STUN_URLS: z.string().optional(),
    PAIRING_MANIFEST_COOKIE_SECRET: z.string().optional(),
    PAIRING_REDIS_URL: z.string().optional(),
    PAIRING_CREATE_TOKEN: z.string().optional(),
    PAIRING_CREATE_LIMIT_PER_MINUTE: z.string().optional(),
    PAIRING_VERIFY_LIMIT_PER_MINUTE: z.string().optional(),
    PAIRING_RECONNECT_LIMIT_PER_MINUTE: z.string().optional(),
})

export interface PairingBrokerConfig {
    host: string
    port: number
    publicUrl: string
    sessionTtlSeconds: number
    handoffTicketTtlSeconds: number
    reconnectChallengeTtlSeconds: number
    disconnectGraceMs: number
    stunUrls: string[]
    manifestCookieSecret: string | null
    redisUrl: string | null
    createToken: string | null
    createLimitPerMinute: number
    verifyLimitPerMinute: number
    reconnectLimitPerMinute: number
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
    const sessionTtlSeconds = parsePositiveInt(parsed.PAIRING_SESSION_TTL_SECONDS, PAIRING_SESSION_TTL_SECONDS)
    const handoffTicketTtlSeconds = parsePositiveInt(
        parsed.PAIRING_HANDOFF_TICKET_TTL_SECONDS,
        PAIRING_HANDOFF_TICKET_TTL_SECONDS
    )
    const reconnectChallengeTtlSeconds = parsePositiveInt(
        parsed.PAIRING_RECONNECT_CHALLENGE_TTL_SECONDS,
        PAIRING_RECONNECT_CHALLENGE_TTL_SECONDS
    )
    const disconnectGraceMs =
        parsePositiveInt(parsed.PAIRING_DISCONNECT_GRACE_SECONDS, PAIRING_MOBILE_DISCONNECT_GRACE_SECONDS) * 1000
    const stunUrls = parseCsvUrls(parsed.PAIRING_STUN_URLS)
    return {
        host,
        port,
        publicUrl,
        sessionTtlSeconds,
        handoffTicketTtlSeconds,
        reconnectChallengeTtlSeconds,
        disconnectGraceMs,
        stunUrls,
        manifestCookieSecret: trimNullable(parsed.PAIRING_MANIFEST_COOKIE_SECRET),
        redisUrl: trimNullable(parsed.PAIRING_REDIS_URL),
        createToken: trimNullable(parsed.PAIRING_CREATE_TOKEN),
        createLimitPerMinute: parsePositiveInt(parsed.PAIRING_CREATE_LIMIT_PER_MINUTE, 30),
        verifyLimitPerMinute: parsePositiveInt(parsed.PAIRING_VERIFY_LIMIT_PER_MINUTE, 30),
        reconnectLimitPerMinute: parsePositiveInt(parsed.PAIRING_RECONNECT_LIMIT_PER_MINUTE, 60),
    }
}
