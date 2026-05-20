import { describe, expect, it } from 'bun:test'
import {
    PAIRING_MOBILE_DISCONNECT_GRACE_MS,
    PAIRING_RECONNECT_CHALLENGE_TTL_SECONDS,
    PAIRING_TICKET_TTL_SECONDS,
    PAIRING_TURN_CREDENTIAL_TTL_SECONDS,
} from '@viby/protocol/pairing'
import { readPairingBrokerConfig } from './config'

describe('pairing config', () => {
    it('defaults mobile timing from the shared pairing timing owner', () => {
        const config = readPairingBrokerConfig({})

        expect(config.disconnectGraceMs).toBe(PAIRING_MOBILE_DISCONNECT_GRACE_MS)
        expect(config.ticketTtlSeconds).toBe(PAIRING_TICKET_TTL_SECONDS)
        expect(config.reconnectChallengeTtlSeconds).toBe(PAIRING_RECONNECT_CHALLENGE_TTL_SECONDS)
        expect(config.turnCredentialTtlSeconds).toBe(PAIRING_TURN_CREDENTIAL_TTL_SECONDS)
    })

    it('reads STUN plus TURN fallback settings from env', () => {
        expect(
            readPairingBrokerConfig({
                PAIRING_PUBLIC_URL: 'https://pair.example.com/',
                PAIRING_STUN_URLS: 'stun:turn.example.com:3478',
                PAIRING_TURN_URLS: 'turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp',
                PAIRING_TURN_STATIC_AUTH_SECRET: 'turn-secret',
                PAIRING_TURN_CREDENTIAL_TTL_SECONDS: '900',
                PAIRING_MANIFEST_COOKIE_SECRET: 'manifest-cookie-secret',
                PAIRING_DISCONNECT_GRACE_SECONDS: '75',
            })
        ).toMatchObject({
            publicUrl: 'https://pair.example.com',
            stunUrls: ['stun:turn.example.com:3478'],
            turnUrls: ['turn:turn.example.com:3478?transport=udp', 'turn:turn.example.com:3478?transport=tcp'],
            turnStaticAuthSecret: 'turn-secret',
            turnCredentialTtlSeconds: 900,
            manifestCookieSecret: 'manifest-cookie-secret',
            disconnectGraceMs: 75_000,
        })
    })
})
