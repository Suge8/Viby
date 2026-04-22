import { describe, expect, it, mock } from 'bun:test'
import type { PairingCreateRequest } from '@viby/protocol/pairing'
import { createPairingBrokerClient } from './client'

const pairingInput: PairingCreateRequest = { label: 'Desk Host' }

describe('createPairingBrokerClient', () => {
    it('trims the broker URL and sends the optional bearer token', async () => {
        const fetchImpl = mock(async (input: unknown, init?: RequestInit): Promise<Response> => {
            expect(input).toBe('https://pair.example.com/pairings')
            expect(init?.method).toBe('POST')
            expect(new Headers(init?.headers).get('authorization')).toBe('Bearer create-secret')
            expect(init?.body).toBe(JSON.stringify(pairingInput))

            return new Response(
                JSON.stringify({
                    pairing: {
                        id: 'pairing-1',
                        state: 'waiting',
                        createdAt: 1,
                        updatedAt: 1,
                        expiresAt: 2,
                        ticketExpiresAt: 2,
                        host: {},
                        guest: null,
                    },
                    hostToken: 'host-token',
                    pairingUrl: 'https://pair.example.com/p/pairing-1#ticket=secret',
                    wsUrl: 'wss://pair.example.com/pairings/pairing-1/ws?token=host-token',
                    iceServers: [{ urls: 'stun:stun.example.com:3478' }],
                })
            )
        }) as unknown as typeof fetch
        const client = createPairingBrokerClient({
            brokerUrl: 'https://pair.example.com///',
            createToken: 'create-secret',
            fetchImpl,
        })

        const response = await client.createPairing(pairingInput)

        expect(response.hostToken).toBe('host-token')
        expect(fetchImpl).toHaveBeenCalledTimes(1)
    })

    it('surfaces broker JSON errors without adding a second error contract', async () => {
        const client = createPairingBrokerClient({
            brokerUrl: 'https://pair.example.com',
            fetchImpl: (async () =>
                new Response(JSON.stringify({ error: 'ticket exhausted' }), {
                    status: 409,
                })) as unknown as typeof fetch,
        })

        await expect(client.createPairing(pairingInput)).rejects.toThrow('ticket exhausted')
    })
})
