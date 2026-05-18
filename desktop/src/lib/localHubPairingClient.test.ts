import { afterEach, describe, expect, it } from 'bun:test'
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
    const originalFetch = globalThis.fetch

    afterEach(() => {
        globalThis.fetch = originalFetch
    })

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

    it('binds the default global fetch so browser runtimes do not throw illegal invocation', async () => {
        globalThis.fetch = async function (
            this: typeof globalThis | undefined,
            input: string | URL
        ): Promise<Response> {
            if (this !== globalThis) {
                throw new Error('illegal invocation')
            }

            const url = String(input)
            if (url.endsWith('/api/auth')) {
                return jsonResponse({ token: 'jwt-1' })
            }

            return jsonResponse({ sessions: [] })
        } as typeof fetch

        const client = new LocalHubPairingClient({
            baseUrl: 'http://127.0.0.1:37173',
            cliApiToken: 'cli-token',
        })

        await expect(client.listSessions()).resolves.toEqual([])
    })

    it('forwards runtime project requests to the authenticated local Hub API', async () => {
        const calls: Array<{ url: string; body?: string }> = []
        const version = {
            status: 'supported' as const,
            supportedVersion: '0.130.0',
            source: 'test',
            installedVersion: '0.130.0',
            checkedAt: 1,
        }
        const fetchImpl = async (input: string | URL, init?: RequestInit): Promise<Response> => {
            const url = String(input)
            calls.push({ url, body: init?.body as string | undefined })
            if (url.endsWith('/api/auth')) {
                return jsonResponse({ token: 'jwt-1' })
            }
            if (url.includes('/api/runtime/directory')) {
                return jsonResponse({ success: true, currentPath: '/repo', entries: [], roots: [] })
            }
            if (url.endsWith('/api/runtime/paths/exists')) {
                return jsonResponse({ exists: { '/repo': true } })
            }
            if (url.endsWith('/api/runtime/agent-config')) {
                return jsonResponse({
                    agents: [
                        { driver: 'codex', path: '/home/user/.codex/config.toml', exists: true, values: {}, version },
                    ],
                })
            }
            if (url.endsWith('/api/runtime/agent-config/codex')) {
                return jsonResponse({
                    agent: {
                        driver: 'codex',
                        path: '/home/user/.codex/config.toml',
                        exists: true,
                        values: { 'codex.model': 'gpt-5.4' },
                        version,
                    },
                })
            }
            if (url.endsWith('/api/runtime/agent-config/codex/restore')) {
                return jsonResponse({
                    agent: {
                        driver: 'codex',
                        path: '/home/user/.codex/config.toml',
                        exists: true,
                        values: { 'codex.model': 'gpt-5.2' },
                        version,
                    },
                })
            }
            if (url.endsWith('/api/runtime/spawn')) {
                return jsonResponse({ type: 'success', sessionId: 'session-1' })
            }
            if (url.endsWith('/api/sessions/session-1/view')) {
                return jsonResponse({ session: { id: 'session-1' }, latestWindow: { messages: [] } })
            }
            return jsonResponse({})
        }
        const client = new LocalHubPairingClient({
            baseUrl: 'http://127.0.0.1:37173',
            cliApiToken: 'cli-token',
            fetchImpl: fetchImpl as typeof fetch,
        })

        await expect(client.browseRuntimeDirectory('/repo')).resolves.toMatchObject({ success: true })
        await expect(client.checkRuntimePathsExists(['/repo'])).resolves.toEqual({ exists: { '/repo': true } })
        await expect(client.getAgentConfig()).resolves.toMatchObject({ agents: [{ driver: 'codex' }] })
        await expect(
            client.saveAgentConfig({ driver: 'codex', values: { 'codex.model': 'gpt-5.4' } })
        ).resolves.toMatchObject({
            agent: {
                driver: 'codex',
                path: '/home/user/.codex/config.toml',
                exists: true,
                values: { 'codex.model': 'gpt-5.4' },
            },
        })
        await expect(
            client.restoreAgentConfig({ driver: 'codex', backupPath: '/home/user/.codex/config.toml.bak' })
        ).resolves.toMatchObject({
            agent: {
                driver: 'codex',
                path: '/home/user/.codex/config.toml',
                exists: true,
                values: { 'codex.model': 'gpt-5.2' },
            },
        })
        await expect(client.spawnSession({ directory: '/repo', agent: 'codex' })).resolves.toEqual({
            type: 'success',
            session: { id: 'session-1' },
        })

        expect(calls.map((call) => call.url)).toContain('http://127.0.0.1:37173/api/runtime/directory?path=%2Frepo')
        expect(calls.find((call) => call.url.endsWith('/api/runtime/paths/exists'))?.body).toBe(
            JSON.stringify({ paths: ['/repo'] })
        )
        expect(calls.find((call) => call.url.endsWith('/api/runtime/agent-config/codex'))?.body).toBe(
            JSON.stringify({ driver: 'codex', values: { 'codex.model': 'gpt-5.4' } })
        )
        expect(calls.find((call) => call.url.endsWith('/api/runtime/agent-config/codex/restore'))?.body).toBe(
            JSON.stringify({ driver: 'codex', backupPath: '/home/user/.codex/config.toml.bak' })
        )
    })
})
