import { describe, expect, it } from 'bun:test'
import { LocalHubPairingClient } from './localHubPairingClient'

function jsonResponse(body: unknown, init?: ResponseInit): Response {
    return new Response(JSON.stringify(body), {
        headers: {
            'content-type': 'application/json',
        },
        ...init,
    })
}

describe('LocalHubPairingClient', () => {
    it('reauthenticates once after a 401 and retries the request', async () => {
        const calls: string[] = []
        const fetchImpl = async (input: string | URL, init?: RequestInit): Promise<Response> => {
            const url = String(input)
            calls.push(url)

            if (url.endsWith('/api/auth')) {
                return jsonResponse({ token: `jwt-${calls.length}` })
            }

            if (calls.filter((entry) => entry.endsWith('/api/sessions')).length === 1) {
                return jsonResponse({ error: 'expired' }, { status: 401 })
            }

            expect(init?.headers instanceof Headers ? init.headers.get('authorization') : null).toContain('jwt-')
            return jsonResponse({ sessions: [] })
        }

        const client = new LocalHubPairingClient({
            baseUrl: 'http://127.0.0.1:37173',
            cliApiToken: 'cli-token',
            fetchImpl: fetchImpl as typeof fetch,
        })

        await expect(client.listSessions()).resolves.toEqual([])
        expect(calls).toEqual([
            'http://127.0.0.1:37173/api/auth',
            'http://127.0.0.1:37173/api/sessions',
            'http://127.0.0.1:37173/api/auth',
            'http://127.0.0.1:37173/api/sessions',
        ])
    })

    it('parses NDJSON pairing event lines', async () => {
        const fetchImpl = async (input: string | URL): Promise<Response> => {
            const url = String(input)
            if (url.endsWith('/api/auth')) {
                return jsonResponse({ token: 'jwt-1' })
            }

            return new Response(
                '{"type":"heartbeat","at":1}\n{"type":"event","event":{"type":"session-removed","sessionId":"session-1"}}\n',
                {
                    headers: {
                        'content-type': 'application/x-ndjson',
                    },
                }
            )
        }

        const client = new LocalHubPairingClient({
            baseUrl: 'http://127.0.0.1:37173',
            cliApiToken: 'cli-token',
            fetchImpl: fetchImpl as typeof fetch,
        })

        const payloads: Array<unknown> = []
        const controller = new AbortController()
        await client.streamEvents({
            signal: controller.signal,
            onPayload: (payload) => payloads.push(payload),
        })

        expect(payloads).toEqual([
            { type: 'heartbeat', at: 1 },
            { type: 'event', event: { type: 'session-removed', sessionId: 'session-1' } },
        ])
    })
})
