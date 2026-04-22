import type { Update, UpdateMachineBody } from '@viby/protocol'
import {
    type AgentAvailabilityResponse,
    ListAgentAvailabilityRequestSchema,
    LocalSessionCatalogRequestSchema,
    LocalSessionExportRequestSchema,
    ResolveAgentLaunchConfigRequestSchema,
    type ResolveAgentLaunchConfigResponse,
} from '@viby/protocol'
import type { LocalSessionCatalog, LocalSessionExportRequest, LocalSessionExportSnapshot } from '@viby/protocol/types'
import type { Socket } from 'socket.io-client'
import { resolvePiAgentLaunchConfig } from '@/pi/launchConfig'
import { logger } from '@/ui/logger'
import { RpcHandlerManager } from './rpc/RpcHandlerManager'
import type { Machine, MachineMetadata, RunnerState } from './types'

export interface ServerToRunnerEvents {
    update: (data: Update) => void
    'rpc-request': (data: { method: string; params: string }, callback: (response: string) => void) => void
    error: (data: { message: string }) => void
}

export interface RunnerToServerEvents {
    'machine-alive': (data: { machineId: string; time: number }) => void
    'machine-update-metadata': (
        data: { machineId: string; metadata: unknown; expectedVersion: number },
        cb: (
            answer:
                | { result: 'error' }
                | { result: 'version-mismatch'; version: number; metadata: unknown | null }
                | { result: 'success'; version: number; metadata: unknown | null }
        ) => void
    ) => void
    'machine-update-state': (
        data: { machineId: string; runnerState: unknown | null; expectedVersion: number },
        cb: (
            answer:
                | { result: 'error' }
                | { result: 'version-mismatch'; version: number; runnerState: unknown | null }
                | { result: 'success'; version: number; runnerState: unknown | null }
        ) => void
    ) => void
    'rpc-register': (data: { method: string }) => void
    'rpc-unregister': (data: { method: string }) => void
}

export type MachineRpcHandlers = {
    spawnSession: (
        options: import('../modules/common/rpcTypes').SpawnSessionOptions
    ) => Promise<import('../modules/common/rpcTypes').SpawnSessionResult>
    listLocalSessions: (
        request: import('@viby/protocol/types').LocalSessionCatalogRequest
    ) => Promise<LocalSessionCatalog>
    exportLocalSession: (request: LocalSessionExportRequest) => Promise<LocalSessionExportSnapshot>
    listAgentAvailability: (request: {
        directory?: string
        forceRefresh?: boolean
    }) => Promise<AgentAvailabilityResponse>
    stopSession: (sessionId: string) => boolean
    requestShutdown: () => void
}

export type ApiMachineClientOptions = {
    getMachineMetadata?: () => MachineMetadata
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

function machineCapabilitiesMatch(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
    if (!left && !right) {
        return true
    }

    if (!left || !right || left.length !== right.length) {
        return false
    }

    return left.every((capability, index) => capability === right[index])
}

export function machineMetadataMatches(current: MachineMetadata | null, next: MachineMetadata): boolean {
    if (!current) {
        return false
    }

    return (
        current.host === next.host &&
        current.platform === next.platform &&
        current.vibyCliVersion === next.vibyCliVersion &&
        current.displayName === next.displayName &&
        machineCapabilitiesMatch(current.capabilities, next.capabilities) &&
        current.homeDir === next.homeDir &&
        current.vibyHomeDir === next.vibyHomeDir &&
        current.vibyLibDir === next.vibyLibDir
    )
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

    rpcHandlerManager.registerHandler('stop-runner', () => {
        handlers.requestShutdown()
        return { message: 'Runner stop request acknowledged' }
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
                    message: 'Invalid agent launch config request',
                }
            }

            if (parsed.data.agent !== 'pi') {
                return {
                    type: 'error',
                    message: `Unsupported agent launch config request: ${parsed.data.agent}`,
                }
            }

            try {
                return {
                    type: 'success',
                    config: await resolvePiAgentLaunchConfig(parsed.data.directory),
                }
            } catch (error) {
                logger.debug('[API MACHINE] Failed to resolve agent launch config', error)
                return {
                    type: 'error',
                    message: error instanceof Error ? error.message : 'Failed to resolve agent launch config',
                }
            }
        }
    )
}

export function bindMachineSocketHandlers(options: {
    socket: Socket<ServerToRunnerEvents, RunnerToServerEvents>
    machine: Machine
    onRpcRequest: (data: { method: string; params: string }, callback: (response: string) => void) => void
    onRunnerUpdate: (update: UpdateMachineBody) => void
    onConnect: () => void
    onDisconnect: () => void
}): void {
    options.socket.on('connect', options.onConnect)
    options.socket.on('disconnect', options.onDisconnect)
    options.socket.on('rpc-request', options.onRpcRequest)
    options.socket.on('update', (data) => {
        if (data.body.t === 'update-machine') {
            const update = data.body as UpdateMachineBody
            if (update.machineId === options.machine.id) {
                options.onRunnerUpdate(update)
            }
        }
    })
}
