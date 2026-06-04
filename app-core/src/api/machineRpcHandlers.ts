import {
    type AgentAvailabilityResponse,
    type AgentConfigFileState,
    type AgentConfigResponse,
    type ListAgentAvailabilityRequest,
    ListAgentAvailabilityRequestSchema,
    LocalSessionCatalogRequestSchema,
    LocalSessionExportRequestSchema,
    type OpenAgentConfigRequest,
    OpenAgentConfigRequestSchema,
    type OpenAgentConfigResponse,
    ResolveAgentLaunchConfigRequestSchema,
    type ResolveAgentLaunchConfigResponse,
    type RestoreAgentConfigRequest,
    RestoreAgentConfigRequestSchema,
    type SaveAgentConfigRequest,
    SaveAgentConfigRequestSchema,
} from '@viby/protocol'
import type { LocalSessionCatalog, LocalSessionExportRequest, LocalSessionExportSnapshot } from '@viby/protocol/types'
import { classifyAgentLaunchConfigError, resolveAgentLaunchConfig } from '@/agent/agentLaunchConfig'
import { logger } from '@/ui/logger'
import { RpcHandlerManager } from './rpc/RpcHandlerManager'
import type { RuntimeState } from './types'

export type MachineRpcHandlers = {
    spawnSession: (
        options: import('../modules/common/rpcTypes').SpawnSessionOptions
    ) => Promise<import('../modules/common/rpcTypes').SpawnSessionResult>
    listLocalSessions: (
        request: import('@viby/protocol/types').LocalSessionCatalogRequest
    ) => Promise<LocalSessionCatalog>
    exportLocalSession: (request: LocalSessionExportRequest) => Promise<LocalSessionExportSnapshot>
    listAgentAvailability: (request: ListAgentAvailabilityRequest) => Promise<AgentAvailabilityResponse>
    loadAgentConfigFiles: () => Promise<AgentConfigResponse>
    saveAgentConfigFile: (request: SaveAgentConfigRequest) => Promise<AgentConfigFileState>
    restoreAgentConfigFile: (request: RestoreAgentConfigRequest) => Promise<AgentConfigFileState>
    openAgentConfigFile: (request: OpenAgentConfigRequest) => Promise<OpenAgentConfigResponse>
    stopSession: (sessionId: string) => boolean
    requestShutdown: () => void
}

export function readRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

export function readOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined
}

export function readRequiredString(value: unknown, message: string): string {
    if (typeof value !== 'string' || !value) {
        throw new Error(message)
    }

    return value
}

export function registerMachineRpcHandlers(rpcHandlerManager: RpcHandlerManager, handlers: MachineRpcHandlers): void {
    rpcHandlerManager.registerHandler('spawn-viby-session', async (params: unknown) => {
        const request = readRecord(params)
        const result = await handlers.spawnSession({
            directory: readRequiredString(request.directory, 'Directory is required'),
            sessionId: readOptionalString(request.sessionId),
            resumeSessionId: readOptionalString(request.resumeSessionId),
            machineId: readOptionalString(request.machineId),
            approvedNewDirectoryCreation: request.approvedNewDirectoryCreation === true,
            agent: request.agent as import('../modules/common/rpcTypes').SpawnSessionOptions['agent'],
            model: readOptionalString(request.model),
            modelReasoningEffort:
                request.modelReasoningEffort as import('../modules/common/rpcTypes').SpawnSessionOptions['modelReasoningEffort'],
            codexServiceTier:
                request.codexServiceTier as import('../modules/common/rpcTypes').SpawnSessionOptions['codexServiceTier'],
            permissionMode:
                request.permissionMode as import('../modules/common/rpcTypes').SpawnSessionOptions['permissionMode'],
            collaborationMode:
                request.collaborationMode as import('../modules/common/rpcTypes').SpawnSessionOptions['collaborationMode'],
            token: readOptionalString(request.token),
            sessionType: request.sessionType as import('../modules/common/rpcTypes').SpawnSessionOptions['sessionType'],
            worktreeName: readOptionalString(request.worktreeName),
            driverSwitch:
                request.driverSwitch as import('../modules/common/rpcTypes').SpawnSessionOptions['driverSwitch'],
        })

        switch (result.type) {
            case 'success':
                return { type: 'success', sessionId: result.sessionId }
            case 'requestToApproveDirectoryCreation':
                return { type: 'requestToApproveDirectoryCreation', directory: result.directory }
            case 'error':
                return { type: 'error', errorMessage: result.errorMessage }
        }
    })

    rpcHandlerManager.registerHandler('stop-session', (params: unknown) => {
        const sessionId = readRequiredString(readRecord(params).sessionId, 'Session ID is required')
        const success = handlers.stopSession(sessionId)
        if (!success) {
            throw new Error('Session not found or failed to stop')
        }

        return { message: 'Session stopped' }
    })

    rpcHandlerManager.registerHandler('list-local-sessions', async (params: unknown): Promise<LocalSessionCatalog> => {
        const parsed = LocalSessionCatalogRequestSchema.safeParse(params)
        if (!parsed.success) {
            throw new Error('Invalid local session catalog request')
        }

        return await handlers.listLocalSessions(parsed.data)
    })

    rpcHandlerManager.registerHandler(
        'export-local-session',
        async (params: unknown): Promise<LocalSessionExportSnapshot> => {
            const parsed = LocalSessionExportRequestSchema.safeParse(params)
            if (!parsed.success) {
                throw new Error('Invalid local session export request')
            }

            return await handlers.exportLocalSession(parsed.data)
        }
    )

    rpcHandlerManager.registerHandler('stop-runtime', () => {
        handlers.requestShutdown()
        return { message: 'Runtime stop request acknowledged' }
    })

    rpcHandlerManager.registerHandler(
        'list-agent-availability',
        async (params: unknown): Promise<AgentAvailabilityResponse> => {
            const parsed = ListAgentAvailabilityRequestSchema.safeParse(params)
            if (!parsed.success) {
                throw new Error('Invalid agent availability request')
            }

            return await handlers.listAgentAvailability(parsed.data)
        }
    )

    rpcHandlerManager.registerHandler(
        'resolve-agent-launch-config',
        async (params: unknown): Promise<ResolveAgentLaunchConfigResponse> => {
            const parsed = ResolveAgentLaunchConfigRequestSchema.safeParse(params)
            if (!parsed.success) {
                return {
                    type: 'error',
                    code: 'config_missing',
                    message: 'Invalid agent launch config request',
                }
            }

            try {
                return {
                    type: 'success',
                    config: await resolveAgentLaunchConfig(parsed.data.agent, parsed.data.directory ?? process.cwd()),
                }
            } catch (error) {
                logger.debug('[API MACHINE] Failed to resolve agent launch config', error)
                return {
                    type: 'error',
                    code: classifyAgentLaunchConfigError(error),
                    message: error instanceof Error ? error.message : 'Failed to resolve agent launch config',
                }
            }
        }
    )

    rpcHandlerManager.registerHandler('load-agent-config-files', async (): Promise<AgentConfigResponse> => {
        return await handlers.loadAgentConfigFiles()
    })

    rpcHandlerManager.registerHandler(
        'save-agent-config-file',
        async (params: unknown): Promise<AgentConfigFileState> => {
            const parsed = SaveAgentConfigRequestSchema.safeParse(params)
            if (!parsed.success) {
                throw new Error('Invalid agent config save request')
            }
            return await handlers.saveAgentConfigFile(parsed.data)
        }
    )

    rpcHandlerManager.registerHandler(
        'restore-agent-config-file',
        async (params: unknown): Promise<AgentConfigFileState> => {
            const parsed = RestoreAgentConfigRequestSchema.safeParse(params)
            if (!parsed.success) {
                throw new Error('Invalid agent config restore request')
            }
            return await handlers.restoreAgentConfigFile(parsed.data)
        }
    )

    rpcHandlerManager.registerHandler(
        'open-agent-config-file',
        async (params: unknown): Promise<OpenAgentConfigResponse> => {
            const parsed = OpenAgentConfigRequestSchema.safeParse(params)
            if (!parsed.success) {
                throw new Error('Invalid agent config open request')
            }
            return await handlers.openAgentConfigFile(parsed.data)
        }
    )
}
