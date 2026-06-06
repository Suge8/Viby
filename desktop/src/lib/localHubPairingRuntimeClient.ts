import type {
    AgentAvailabilityResponse,
    AgentConfigResponse,
    ListAgentAvailabilityRequest,
    LocalSessionCatalog,
    LocalSessionExportRequest,
    MachineDirectoryResponse,
    OpenAgentConfigRequest,
    OpenAgentConfigResponse,
    ResolveAgentLaunchConfigRequest,
    ResolveAgentLaunchConfigResponse,
    RestoreAgentConfigRequest,
    RestoreAgentConfigResponse,
    RuntimeCapabilityRequest,
    RuntimeCapabilityResponse,
    SaveAgentConfigRequest,
    SaveAgentConfigResponse,
    Session,
} from '@viby/protocol/types'
import type { LocalHubPairingRequestJson } from './localHubPairingRequest'

function appendRuntimeCapabilityParams(params: URLSearchParams, input: RuntimeCapabilityRequest): void {
    if (input.directory) params.set('directory', input.directory)
    if (input.forceRefresh) params.set('forceRefresh', 'true')
    if (input.drivers?.length) params.set('drivers', input.drivers.join(','))
    if (input.depth) params.set('depth', input.depth)
}

export async function getRuntimeCapabilities(
    requestJson: LocalHubPairingRequestJson,
    input: RuntimeCapabilityRequest = { depth: 'availability' }
): Promise<RuntimeCapabilityResponse> {
    const params = new URLSearchParams()
    appendRuntimeCapabilityParams(params, input)
    const query = params.toString()
    return await requestJson<RuntimeCapabilityResponse>(`/api/runtime/capabilities${query ? `?${query}` : ''}`)
}

export async function getRuntimeAgentAvailability(
    requestJson: LocalHubPairingRequestJson,
    input: ListAgentAvailabilityRequest = {}
): Promise<AgentAvailabilityResponse> {
    const params = new URLSearchParams()
    if (input.directory) params.set('directory', input.directory)
    if (input.forceRefresh) params.set('forceRefresh', 'true')
    if (input.drivers?.length) params.set('drivers', input.drivers.join(','))
    const query = params.toString()
    return await requestJson<AgentAvailabilityResponse>(`/api/runtime/agent-availability${query ? `?${query}` : ''}`)
}

export async function getAgentConfig(requestJson: LocalHubPairingRequestJson): Promise<AgentConfigResponse> {
    return await requestJson<AgentConfigResponse>('/api/runtime/agent-config')
}

export async function saveAgentConfig(
    requestJson: LocalHubPairingRequestJson,
    input: SaveAgentConfigRequest
): Promise<SaveAgentConfigResponse> {
    return await requestJson<SaveAgentConfigResponse>(`/api/runtime/agent-config/${encodeURIComponent(input.driver)}`, {
        method: 'PUT',
        body: JSON.stringify(input),
    })
}

export async function restoreAgentConfig(
    requestJson: LocalHubPairingRequestJson,
    input: RestoreAgentConfigRequest
): Promise<RestoreAgentConfigResponse> {
    return await requestJson<RestoreAgentConfigResponse>(
        `/api/runtime/agent-config/${encodeURIComponent(input.driver)}/restore`,
        {
            method: 'POST',
            body: JSON.stringify(input),
        }
    )
}

export async function openAgentConfig(
    requestJson: LocalHubPairingRequestJson,
    input: OpenAgentConfigRequest
): Promise<OpenAgentConfigResponse> {
    return await requestJson<OpenAgentConfigResponse>(
        `/api/runtime/agent-config/${encodeURIComponent(input.driver)}/open`,
        {
            method: 'POST',
            body: JSON.stringify(input),
        }
    )
}

export async function checkRuntimePathsExists(
    requestJson: LocalHubPairingRequestJson,
    paths: string[]
): Promise<{ exists: Record<string, boolean> }> {
    return await requestJson('/api/runtime/paths/exists', { method: 'POST', body: JSON.stringify({ paths }) })
}

export async function browseRuntimeDirectory(
    requestJson: LocalHubPairingRequestJson,
    path?: string,
    workspaceRoot?: string | null
): Promise<MachineDirectoryResponse> {
    const queryParams = new URLSearchParams()
    if (path) queryParams.set('path', path)
    if (workspaceRoot) queryParams.set('workspaceRoot', workspaceRoot)
    const query = queryParams.size > 0 ? `?${queryParams.toString()}` : ''
    return await requestJson<MachineDirectoryResponse>(`/api/runtime/directory${query}`)
}

export async function resolveAgentLaunchConfig(
    requestJson: LocalHubPairingRequestJson,
    input: ResolveAgentLaunchConfigRequest
): Promise<ResolveAgentLaunchConfigResponse> {
    return await requestJson('/api/runtime/agent-launch-config', { method: 'POST', body: JSON.stringify(input) })
}

export async function listRuntimeLocalSessions(
    requestJson: LocalHubPairingRequestJson,
    path: string,
    driver: LocalSessionExportRequest['driver']
): Promise<LocalSessionCatalog> {
    return await requestJson<LocalSessionCatalog>(
        `/api/runtime/local-sessions?${new URLSearchParams({ path, driver }).toString()}`
    )
}

export async function importRuntimeLocalSession(
    requestJson: LocalHubPairingRequestJson,
    input: LocalSessionExportRequest
): Promise<{ session: Session; imported: boolean }> {
    return await requestJson('/api/runtime/local-sessions/import', { method: 'POST', body: JSON.stringify(input) })
}
