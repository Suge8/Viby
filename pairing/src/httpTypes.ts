import type { PairingCreateRequest, PairingParticipantRecord, PairingSessionRecord } from '@viby/protocol/pairing'
import { PairingSessionRecordSchema } from '@viby/protocol/pairing'
import type { createBunWebSocket } from 'hono/bun'
import type { PairingMetrics } from './metrics'
import type { PairingRateLimiter, PairingRateLimitRule } from './rateLimit'
import type { PairingStore } from './store'
import type { TurnCredentialGenerator } from './turn'
import type { PairingSocketHub } from './ws'

export type UpgradeWebSocket = ReturnType<typeof createBunWebSocket>['upgradeWebSocket']

export interface PairingHttpOptions {
    store: PairingStore
    socketHub: PairingSocketHub
    publicUrl: string
    sessionTtlSeconds: number
    ticketTtlSeconds: number
    reconnectChallengeTtlSeconds: number
    stunUrls: readonly string[]
    turnGenerator: TurnCredentialGenerator | null
    createToken: string | null
    upgradeWebSocket: UpgradeWebSocket
    logger?: Pick<Console, 'error' | 'info' | 'warn'>
    rateLimiter?: PairingRateLimiter
    rateLimitRules?: {
        create: PairingRateLimitRule
        claim: PairingRateLimitRule
        reconnect: PairingRateLimitRule
        approve: PairingRateLimitRule
    }
    metrics?: PairingMetrics
    now?: () => number
}

export type { PairingCreateRequest, PairingParticipantRecord, PairingSessionRecord }
export { PairingSessionRecordSchema }
