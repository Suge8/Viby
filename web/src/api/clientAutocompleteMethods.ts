import type { CommandCapabilitiesResponse } from '@/types/api'
import type { ApiClientRequest } from './client'
import { getCommandCapabilities } from './clientAutocomplete'

export function createApiClientAutocompleteMethods(request: ApiClientRequest) {
    return {
        async getCommandCapabilities(sessionId: string, revision?: string): Promise<CommandCapabilitiesResponse> {
            return await getCommandCapabilities(request, sessionId, revision)
        },
    }
}
