import type { AuthResponse } from '@/types/api'
import { ApiError, buildApiUrl, parseErrorPayload } from './clientShared'

export async function authenticateWithAccessToken(
    baseUrl: string,
    accessToken: string
): Promise<AuthResponse> {
    const response = await fetch(buildApiUrl(baseUrl, '/api/auth'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accessToken })
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

    return await response.json() as AuthResponse
}
