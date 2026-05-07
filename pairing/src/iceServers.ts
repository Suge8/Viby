import { createHmac } from 'node:crypto'
import type { PairingIceServer } from '@viby/protocol/pairing'

const TURN_REST_USERNAME_SEPARATOR = ':'

export interface PairingTurnConfig {
    urls: readonly string[]
    staticAuthSecret: string | null
    credentialTtlSeconds: number
}

export interface PairingIceServerConfig {
    stunUrls: readonly string[]
    turn: PairingTurnConfig
}

export interface TurnRestCredentials {
    username: string
    credential: string
    credentialType: 'password'
}

export function parseCsvUrls(raw: string | undefined | null): string[] {
    if (!raw) {
        return []
    }

    return raw
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
}

export function createTurnRestCredentials(options: {
    pairingId: string
    now: number
    ttlSeconds: number
    staticAuthSecret: string
}): TurnRestCredentials {
    const expiresAtSeconds = Math.floor((options.now + options.ttlSeconds * 1000) / 1000)
    const username = `${expiresAtSeconds}${TURN_REST_USERNAME_SEPARATOR}${options.pairingId}`
    return {
        username,
        credential: createHmac('sha1', options.staticAuthSecret).update(username).digest('base64'),
        credentialType: 'password',
    }
}

export function buildIceServers(config: PairingIceServerConfig, pairingId: string, now: number): PairingIceServer[] {
    const stunServers = config.stunUrls.map((stunUrl) => ({ urls: stunUrl }))
    if (!config.turn.staticAuthSecret || config.turn.urls.length === 0) {
        return stunServers
    }

    return [
        ...stunServers,
        {
            urls: [...config.turn.urls],
            ...createTurnRestCredentials({
                pairingId,
                now,
                ttlSeconds: config.turn.credentialTtlSeconds,
                staticAuthSecret: config.turn.staticAuthSecret,
            }),
        },
    ]
}
