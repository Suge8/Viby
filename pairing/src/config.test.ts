import { describe, expect, it } from 'bun:test'
import {
    PAIRING_HANDOFF_TICKET_TTL_SECONDS,
    PAIRING_MOBILE_DISCONNECT_GRACE_MS,
    PAIRING_RECONNECT_CHALLENGE_TTL_SECONDS,
} from '@viby/protocol/pairing'
import { readPairingBrokerConfig } from './config'

describe('pairing config', () => {
    it('defaults mobile timing from the shared pairing timing owner', () => {
        const config = readPairingBrokerConfig({})

        expect(config.disconnectGraceMs).toBe(PAIRING_MOBILE_DISCONNECT_GRACE_MS)
        expect(config.handoffTicketTtlSeconds).toBe(PAIRING_HANDOFF_TICKET_TTL_SECONDS)
        expect(config.reconnectChallengeTtlSeconds).toBe(PAIRING_RECONNECT_CHALLENGE_TTL_SECONDS)
    })

    it('reads STUN settings from env', () => {
        expect(
            readPairingBrokerConfig({
                PAIRING_PUBLIC_URL: 'https://pair.example.com/',
                PAIRING_STUN_URLS: 'stun:turn.example.com:3478',
                PAIRING_MANIFEST_COOKIE_SECRET: 'manifest-cookie-secret',
                PAIRING_DISCONNECT_GRACE_SECONDS: '75',
            })
        ).toMatchObject({
            publicUrl: 'https://pair.example.com',
            stunUrls: ['stun:turn.example.com:3478'],
            manifestCookieSecret: 'manifest-cookie-secret',
            disconnectGraceMs: 75_000,
        })
    })
})
