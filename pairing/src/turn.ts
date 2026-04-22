import { createHmac } from 'node:crypto'
import type { PairingIceServer } from '@viby/protocol/pairing'

export interface TurnCredentials {
    urls: string[]
    username: string
    credential: string
    credentialType: 'password'
    expiresAt: number
    realm: string
}

export interface TurnCredentialGenerator {
    create(subject: string, options?: { now?: number; ttlSeconds?: number }): TurnCredentials | null
}

export interface TurnCredentialGeneratorConfig {
    urls: readonly string[]
    secret: string
    realm: string
    ttlSeconds: number
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

export function createStaticTurnCredentialGenerator(config: TurnCredentialGeneratorConfig): TurnCredentialGenerator {
    const urls = [...config.urls]

    return {
        create(subject, options = {}) {
            const ttlSeconds = options.ttlSeconds ?? config.ttlSeconds
            const now = options.now ?? Date.now()
            const expiresAt = now + ttlSeconds * 1000
            const username = `${Math.floor(expiresAt / 1000)}:${subject}`
            const credential = createHmac('sha1', config.secret).update(username).digest('base64')

            return {
                urls,
                username,
                credential,
                credentialType: 'password',
                expiresAt,
                realm: config.realm,
            }
        },
    }
}

export function buildIceServers(options: {
    stunUrls: readonly string[]
    turn: TurnCredentials | null
}): PairingIceServer[] {
    const servers: PairingIceServer[] = []

    for (const stunUrl of options.stunUrls) {
        servers.push({ urls: stunUrl })
    }

    if (options.turn) {
        servers.push({
            urls: options.turn.urls,
            username: options.turn.username,
            credential: options.turn.credential,
            credentialType: 'password',
        })
    }

    return servers
}
