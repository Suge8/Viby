import type { DevicePlatform } from '@viby/protocol/deviceAuth'
import type { AuthResponse } from '@/types/api'
import { ApiError, buildApiUrl, parseErrorPayload } from './clientShared'

async function authenticate(baseUrl: string, path: string, body: unknown): Promise<AuthResponse> {
    const response = await fetch(buildApiUrl(baseUrl, path), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    })

    if (!response.ok) {
        const body = await response.text().catch(() => '')
        const parsed = parseErrorPayload(body)
        const detail = body ? `: ${body}` : ''
        throw new ApiError(
            `Auth failed: HTTP ${response.status} ${response.statusText}${detail}`,
            response.status,
            parsed.code,
            body || undefined
        )
    }

    return (await response.json()) as AuthResponse
}

export async function authenticateWithAccessToken(
    baseUrl: string,
    accessToken: string,
    options: { platform?: DevicePlatform; deviceName?: string } = {}
): Promise<AuthResponse> {
    return await authenticate(baseUrl, '/api/auth', { accessToken, ...options })
}

export async function authenticateWithPairingCode(
    baseUrl: string,
    code: string,
    options: { platform?: DevicePlatform; deviceName?: string } = {}
): Promise<AuthResponse> {
    return await authenticate(baseUrl, '/api/device-auth/code/verify', { code, ...options })
}

export async function authenticateWithDevice(baseUrl: string, deviceId: string, secret: string): Promise<AuthResponse> {
    return await authenticate(baseUrl, '/api/device-auth/reconnect', { deviceId, secret })
}
