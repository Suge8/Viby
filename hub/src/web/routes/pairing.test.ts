import { describe, expect, it } from 'bun:test'
import type { PairingCreateRequest, PairingCreateResponse } from '@viby/protocol/pairing'
import { Hono } from 'hono'
import type { SyncEngine, SyncEventListener } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createPairingRoutes } from './pairing'

async function readFirstLine(response: Response): Promise<string> {
    const reader = response.body?.getReader()
    expect(reader).toBeDefined()
    const chunk = await reader!.read()
    const text = new TextDecoder().decode(chunk.value)
    await reader!.cancel()
    return text.trim()
}

describe('pairing routes', () => {
    it('proxies pairing session creation to the configured broker client', async () => {
        const app = new Hono<WebAppEnv>()
        const client = {
            isConfigured: () => true,
            createPairing: async (_input: PairingCreateRequest): Promise<PairingCreateResponse> => ({
                pairing: {
                    id: 'pairing-1',
                    state: 'waiting',
                    createdAt: 1,
                    updatedAt: 1,
                    expiresAt: 2,
                    ticketExpiresAt: 2,
                    shortCode: null,
                    approvalStatus: null,
                    host: {},
                    guest: null,
                },
                hostToken: 'host-token',
                pairingUrl: 'https://pair.example.com/p/pairing-1#ticket=secret',
                wsUrl: 'wss://pair.example.com/pairings/pairing-1/ws?token=host-token',
                iceServers: [{ urls: 'stun:stun.example.com:3478' }],
            }),
        }

        app.route('/api', createPairingRoutes(client))
        const response = await app.request('/api/pairings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ label: 'Desk Host' }),
        })

        expect(response.status).toBe(200)
        const json = (await response.json()) as PairingCreateResponse
        expect(json.pairing.id).toBe('pairing-1')
        expect(json.hostToken).toBe('host-token')
    })

    it('returns 503 when the broker is not configured', async () => {
        const app = new Hono<WebAppEnv>()
        app.route(
            '/api',
            createPairingRoutes({
                isConfigured: () => false,
                createPairing: async () => {
                    throw new Error('unreachable')
                },
            })
        )

        const response = await app.request('/api/pairings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}),
        })

        expect(response.status).toBe(503)
    })

    it('streams authoritative sync events for the pairing bridge', async () => {
        const app = new Hono<WebAppEnv>()
        let listener: SyncEventListener | null = null
        const engine = {
            subscribe(next: SyncEventListener) {
                listener = next
                return () => {
                    listener = null
                }
            },
        } as unknown as SyncEngine

        app.route(
            '/api',
            createPairingRoutes(
                {
                    isConfigured: () => false,
                    createPairing: async () => {
                        throw new Error('unreachable')
                    },
                },
                () => engine
            )
        )

        const response = await app.request('/api/pairing/events')
        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toContain('application/x-ndjson')

        const currentListener = listener as SyncEventListener | null
        if (currentListener) {
            currentListener({
                type: 'session-updated',
                sessionId: 'session-1',
                data: { sid: 'session-1' },
            })
        }

        const line = await readFirstLine(response)
        expect(JSON.parse(line)).toEqual({
            type: 'event',
            event: {
                type: 'session-updated',
                sessionId: 'session-1',
                data: { sid: 'session-1' },
            },
        })
    })
})
