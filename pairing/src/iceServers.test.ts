import { describe, expect, it } from 'bun:test'
import { createHmac } from 'node:crypto'
import { buildIceServers, createTurnRestCredentials, parseCsvUrls } from './iceServers'

describe('iceServers', () => {
    it('builds STUN-only ICE servers without TURN credentials', () => {
        expect(
            buildIceServers(
                {
                    stunUrls: ['stun:stun.example.com:3478'],
                    turn: { urls: [], staticAuthSecret: null, credentialTtlSeconds: 600 },
                },
                'pairing-1',
                1_700_000_000_000
            )
        ).toEqual([{ urls: 'stun:stun.example.com:3478' }])
    })

    it('builds coturn REST temporary credentials server-side', () => {
        const now = 1_700_000_000_000
        const credentials = createTurnRestCredentials({
            pairingId: 'pairing-1',
            now,
            ttlSeconds: 600,
            staticAuthSecret: 'turn-secret',
        })
        const expectedUsername = '1700000600:pairing-1'

        expect(credentials).toEqual({
            username: expectedUsername,
            credential: createHmac('sha1', 'turn-secret').update(expectedUsername).digest('base64'),
            credentialType: 'password',
        })
    })

    it('returns STUN plus one credentialed TURN server group when configured', () => {
        const iceServers = buildIceServers(
            {
                stunUrls: ['stun:turn.example.com:3478'],
                turn: {
                    urls: ['turn:turn.example.com:3478?transport=udp', 'turn:turn.example.com:3478?transport=tcp'],
                    staticAuthSecret: 'turn-secret',
                    credentialTtlSeconds: 600,
                },
            },
            'pairing-1',
            1_700_000_000_000
        )

        expect(iceServers).toEqual([
            { urls: 'stun:turn.example.com:3478' },
            {
                urls: ['turn:turn.example.com:3478?transport=udp', 'turn:turn.example.com:3478?transport=tcp'],
                username: '1700000600:pairing-1',
                credential: createHmac('sha1', 'turn-secret').update('1700000600:pairing-1').digest('base64'),
                credentialType: 'password',
            },
        ])
    })

    it('normalizes comma-separated ICE urls', () => {
        expect(parseCsvUrls(' stun:a.example.com:3478,turn:b.example.com:3478?transport=tcp ,,')).toEqual([
            'stun:a.example.com:3478',
            'turn:b.example.com:3478?transport=tcp',
        ])
    })
})
