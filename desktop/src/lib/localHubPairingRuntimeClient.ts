import type {
    AgentAvailabilityResponse,
    ListAgentAvailabilityRequest,
    LocalSessionCatalog,
    LocalSessionExportRequest,
    MachineDirectoryResponse,
    ResolveAgentLaunchConfigRequest,
    ResolveAgentLaunchConfigResponse,
    RuntimeCapabilityRequest,
    RuntimeCapabilityResponse,
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

export async function checkRuntimePathsExists(
    requestJson: LocalHubPairingRequestJson,
    paths: string[]
): Promise<{ exists: Record<string, boolean> }> {
    return await requestJson('/api/runtime/paths/exists', { method: 'POST', body: JSON.stringify({ paths }) })
}

export async function browseRuntimeDirectory(
    requestJson: LocalHubPairingRequestJson,
    path?: string
): Promise<MachineDirectoryResponse> {
    const query = path ? `?${new URLSearchParams({ path }).toString()}` : ''
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
