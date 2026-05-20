import type { DeviceChannel, DevicePlatform } from '@viby/protocol/deviceAuth'
import type { HubRuntimeStatus } from '@/types'

export type DeviceAuthDevice = {
    id: string
    name: string | null
    platform: DevicePlatform | null
    channel: DeviceChannel | null
    createdAt: number
    lastSeenAt: number
    revokedAt: number | null
    active: boolean
}

export type DeviceAuthSummary = { activeCount: number; devices: DeviceAuthDevice[] }

type FetchImpl = typeof fetch

type AuthCacheEntry = { token: string }

const authTokenCache = new Map<string, AuthCacheEntry>()

function apiUrl(status: HubRuntimeStatus, path: string): string {
    return `${status.localHubUrl.replace(/\/$/, '')}${path}`
}

async function readJson(response: Response): Promise<unknown> {
    try {
        return await response.json()
    } catch {
        throw new Error('Hub returned invalid device summary JSON.')
    }
}

function authCacheKey(status: HubRuntimeStatus): string {
    return `${status.localHubUrl}|${status.hubOwnerToken}`
}

async function getAuthToken(status: HubRuntimeStatus, fetchImpl: FetchImpl): Promise<string> {
    const key = authCacheKey(status)
    const cached = authTokenCache.get(key)
    if (cached) return cached.token

    const authResponse = await fetchImpl(apiUrl(status, '/api/auth'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accessToken: status.hubOwnerToken }),
    })
    if (!authResponse.ok) throw new Error('Hub device summary auth failed.')

    const auth = (await readJson(authResponse)) as { token?: unknown }
    if (typeof auth.token !== 'string') throw new Error('Hub device auth token missing.')
    authTokenCache.set(key, { token: auth.token })
    return auth.token
}

function parseDevices(value: unknown): DeviceAuthDevice[] {
    return Array.isArray(value) ? (value as DeviceAuthDevice[]) : []
}

export async function fetchDeviceAuthSummary(
    status: HubRuntimeStatus,
    fetchImpl: FetchImpl = fetch
): Promise<DeviceAuthSummary> {
    const token = await getAuthToken(status, fetchImpl)
    const devicesResponse = await fetchImpl(apiUrl(status, '/api/device-auth/devices'), {
        headers: { authorization: `Bearer ${token}` },
    })
    if (devicesResponse.status === 401) authTokenCache.delete(authCacheKey(status))
    if (!devicesResponse.ok) throw new Error('Hub device summary request failed.')

    const summary = (await readJson(devicesResponse)) as { activeCount?: unknown; devices?: unknown }
    if (typeof summary.activeCount !== 'number') throw new Error('Hub device summary active count missing.')
    return { activeCount: summary.activeCount, devices: parseDevices(summary.devices) }
}

export async function revokeDeviceAuthBinding(
    status: HubRuntimeStatus,
    deviceId: string,
    fetchImpl: FetchImpl = fetch
): Promise<void> {
    const token = await getAuthToken(status, fetchImpl)
    const response = await fetchImpl(apiUrl(status, `/api/device-auth/devices/${encodeURIComponent(deviceId)}`), {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
    })
    if (response.status === 401) authTokenCache.delete(authCacheKey(status))
    if (!response.ok) throw new Error('Hub device revoke request failed.')
}
