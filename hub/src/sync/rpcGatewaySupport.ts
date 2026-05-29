import {
    AgentAvailabilityResponseSchema,
    AgentConfigFileStateSchema,
    AgentConfigResponseSchema,
    OpenAgentConfigResponseSchema,
    ResolveAgentLaunchConfigResponseSchema,
    RestoreAgentConfigResponseSchema,
} from '@viby/protocol'
import type {
    AgentAvailabilityResponse,
    AgentConfigFileState,
    AgentConfigResponse,
    MachineDirectoryResponse,
    OpenAgentConfigResponse,
    ResolveAgentLaunchConfigResponse,
    RestoreAgentConfigResponse,
} from '@viby/protocol/types'
import type { RpcMachineDirectoryResponse, RpcPathExistsResponse } from './rpcGatewayTypes'

type SpawnSessionResult = { type: 'success'; sessionId: string } | { type: 'error'; message: string }

export function isMissingRpcHandler(error: unknown, machineId: string, method: string): boolean {
    return error instanceof Error && error.message === `RPC handler not registered: ${machineId}:${method}`
}

export function parseSpawnSessionResult(result: unknown): SpawnSessionResult {
    if (result && typeof result === 'object') {
        const obj = result as Record<string, unknown>
        if (obj.type === 'success' && typeof obj.sessionId === 'string') {
            return { type: 'success', sessionId: obj.sessionId }
        }
        if (obj.type === 'error' && typeof obj.errorMessage === 'string') {
            return { type: 'error', message: obj.errorMessage }
        }
        if (obj.type === 'requestToApproveDirectoryCreation' && typeof obj.directory === 'string') {
            return { type: 'error', message: `Directory creation requires approval: ${obj.directory}` }
        }
        if (typeof obj.error === 'string') {
            return { type: 'error', message: obj.error }
        }
        if (obj.type !== 'success' && typeof obj.message === 'string') {
            return { type: 'error', message: obj.message }
        }
    }
    const details =
        typeof result === 'string'
            ? result
            : (() => {
                  try {
                      return JSON.stringify(result)
                  } catch {
                      return String(result)
                  }
              })()
    return { type: 'error', message: `Unexpected spawn result: ${details}` }
}

export function parsePathExistsResponse(result: RpcPathExistsResponse | unknown): Record<string, boolean> {
    if (!result || typeof result !== 'object') {
        throw new Error('Unexpected path-exists result')
    }
    const existsValue = (result as RpcPathExistsResponse).exists
    if (!existsValue || typeof existsValue !== 'object') {
        throw new Error('Unexpected path-exists result')
    }
    const exists: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(existsValue)) {
        exists[key] = value === true
    }
    return exists
}

export function parseMachineDirectoryResponse(result: MachineDirectoryResponse | unknown): RpcMachineDirectoryResponse {
    if (!result || typeof result !== 'object') {
        throw new Error('Unexpected browse-directory result')
    }
    const response = result as MachineDirectoryResponse
    return {
        success: response.success === true,
        currentPath: typeof response.currentPath === 'string' ? response.currentPath : undefined,
        parentPath: response.parentPath ?? null,
        scopeRoot: response.scopeRoot ?? null,
        entries: Array.isArray(response.entries) ? response.entries : [],
        roots: Array.isArray(response.roots) ? response.roots : [],
        error: typeof response.error === 'string' ? response.error : undefined,
    }
}

export function parseResolveAgentLaunchConfigResponse(
    result: ResolveAgentLaunchConfigResponse | unknown
): ResolveAgentLaunchConfigResponse {
    const parsed = ResolveAgentLaunchConfigResponseSchema.safeParse(result)
    if (parsed.success) {
        return parsed.data
    }
    throw new Error('Unexpected resolve-agent-launch-config result')
}

export function parseAgentAvailabilityResponse(result: AgentAvailabilityResponse | unknown): AgentAvailabilityResponse {
    const parsed = AgentAvailabilityResponseSchema.safeParse(result)
    if (parsed.success) {
        return parsed.data
    }

    throw new Error('Unexpected list-agent-availability result')
}

export function parseAgentConfigResponse(result: AgentConfigResponse | unknown): AgentConfigResponse {
    const parsed = AgentConfigResponseSchema.safeParse(result)
    if (parsed.success) {
        return parsed.data
    }

    throw new Error('Unexpected load-agent-config-files result')
}

export function parseAgentConfigFileState(result: AgentConfigFileState | unknown): AgentConfigFileState {
    const parsed = AgentConfigFileStateSchema.safeParse(result)
    if (parsed.success) {
        return parsed.data
    }

    throw new Error('Unexpected save-agent-config-file result')
}

export function parseRestoreAgentConfigResponse(result: RestoreAgentConfigResponse | unknown): AgentConfigFileState {
    const parsed = RestoreAgentConfigResponseSchema.safeParse(result)
    if (parsed.success) {
        return parsed.data.agent
    }

    return parseAgentConfigFileState(result)
}

export function parseOpenAgentConfigResponse(result: OpenAgentConfigResponse | unknown): OpenAgentConfigResponse {
    const parsed = OpenAgentConfigResponseSchema.safeParse(result)
    if (parsed.success) {
        return parsed.data
    }

    throw new Error('Unexpected open-agent-config-file result')
}
