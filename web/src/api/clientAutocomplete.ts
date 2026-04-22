import type { CommandCapabilitiesResponse } from '@/types/api'
import type { ApiClientRequest } from './client'

export async function getCommandCapabilities(
    request: ApiClientRequest,
    sessionId: string,
    revision?: string
): Promise<CommandCapabilitiesResponse> {
    const params = new URLSearchParams()
    if (revision) {
        params.set('revision', revision)
    }
    const suffix = params.size > 0 ? `?${params.toString()}` : ''
    return await request<CommandCapabilitiesResponse>(
        `/api/sessions/${encodeURIComponent(sessionId)}/command-capabilities${suffix}`
    )
}
