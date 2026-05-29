import type { PairingCreateRequest, PairingParticipantRecord, PairingSessionRecord } from '@viby/protocol/pairing'
import { PairingSessionRecordSchema } from '@viby/protocol/pairing'
import type { createBunWebSocket } from 'hono/bun'
import type { PairingManifestCookieSigner } from './manifestCookie'
import type { PairingMetrics } from './metrics'
import type { PairingRateLimiter, PairingRateLimitRule } from './rateLimit'
import type { PairingSessionEventBus } from './sessionEventBus'
import type { PairingStore } from './store'
import type { PairingSocketHub } from './ws'

export type UpgradeWebSocket = ReturnType<typeof createBunWebSocket>['upgradeWebSocket']

export interface PairingHttpOptions {
    store: PairingStore
    socketHub: PairingSocketHub
    tunnelHub: PairingSocketHub
    eventBus: PairingSessionEventBus
    publicUrl: string
    sessionTtlSeconds: number
    handoffTicketTtlSeconds: number
    reconnectChallengeTtlSeconds: number
    stunUrls: readonly string[]
    createToken: string | null
    upgradeWebSocket: UpgradeWebSocket
    logger?: Pick<Console, 'error' | 'info' | 'warn'>
    rateLimiter?: PairingRateLimiter
    rateLimitRules?: {
        create: PairingRateLimitRule
        verify: PairingRateLimitRule
        reconnect: PairingRateLimitRule
        handoffClaim: PairingRateLimitRule
    }
    metrics?: PairingMetrics
    now?: () => number
    webApp?: {
        indexHtml?: string
        assetsRoot?: string
    }
    manifestCookieSigner: PairingManifestCookieSigner
    manifestCookieTtlSeconds: number
}

export type { PairingCreateRequest, PairingParticipantRecord, PairingSessionRecord }
export { PairingSessionRecordSchema }
