import { describe, expect, it } from 'bun:test'
import type { HubRuntimeStatus } from '@/types'
import { fetchDeviceAuthSummary } from './deviceAuthSummary'

const status: HubRuntimeStatus = {
    phase: 'ready',
    pid: 1,
    listenHost: '127.0.0.1',
    listenPort: 3000,
    localHubUrl: 'http://127.0.0.1:3000/',
    preferredBrowserUrl: 'http://127.0.0.1:3000/',
    publicUrl: '',
    publicAccessEnabled: true,
    cliApiToken: 'cli-token',
    settingsFile: '',
    dataDir: '',
    startedAt: '',
    updatedAt: '',
}

describe('deviceAuthSummary', () => {
    it('reads active device count through the Hub owner', async () => {
        const calls: Array<{ url: string; init?: RequestInit }> = []
        const fetchImpl = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
            calls.push({ url: String(url), init })
            if (String(url).endsWith('/api/auth')) return Response.json({ token: 'jwt' })
            return Response.json({ activeCount: 2, devices: [{ id: 'device-1', active: true }] })
        }

        await expect(fetchDeviceAuthSummary(status, fetchImpl as typeof fetch)).resolves.toEqual({
            activeCount: 2,
            devices: [{ id: 'device-1', active: true }],
        })
        expect(calls.map((call) => call.url)).toEqual([
            'http://127.0.0.1:3000/api/auth',
            'http://127.0.0.1:3000/api/device-auth/devices',
        ])
        expect(calls[1]?.init?.headers).toEqual({ authorization: 'Bearer jwt' })
    })

    it('reuses desktop auth tokens for polling so device summary cannot trip auth rate limits', async () => {
        const urls: string[] = []
        const cachedStatus = { ...status, localHubUrl: 'http://127.0.0.1:3001/' }
        const fetchImpl = async (url: string | URL | Request): Promise<Response> => {
            urls.push(String(url))
            if (String(url).endsWith('/api/auth')) return Response.json({ token: 'jwt-cached' })
            return Response.json({ activeCount: 0, devices: [] })
        }

        await fetchDeviceAuthSummary(cachedStatus, fetchImpl as typeof fetch)
        await fetchDeviceAuthSummary(cachedStatus, fetchImpl as typeof fetch)

        expect(urls.filter((url) => url.endsWith('/api/auth'))).toHaveLength(1)
    })
})
