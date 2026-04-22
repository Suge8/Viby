import { io, type Socket } from 'socket.io-client'
import { configuration } from '@/configuration'
import { logger } from '@/ui/logger'
import { getInvokedCwd } from '@/utils/invokedCwd'
import { runDetachedTask } from '@/utils/runDetachedTask'
import { backoff } from '@/utils/time'
import { registerCommonHandlers } from '../modules/common/registerCommonHandlers'
import {
    ApiMachineClientOptions,
    bindMachineSocketHandlers,
    type MachineRpcHandlers,
    machineMetadataMatches,
    type RunnerToServerEvents,
    readRecord,
    registerMachineRpcHandlers,
    type ServerToRunnerEvents,
} from './apiMachineSupport'
import { handleBrowseMachineDirectoryRequest } from './machineDirectoryBrowser'
import { handlePathExistsRequest } from './pathExistsHandler'
import { RpcHandlerManager } from './rpc/RpcHandlerManager'
import type { Machine, MachineMetadata, RunnerState } from './types'
import { MachineMetadataSchema, RunnerStateSchema } from './types'
import { applyVersionedAck } from './versionedUpdate'

export type { ApiMachineClientOptions } from './apiMachineSupport'

export class ApiMachineClient {
    private socket!: Socket<ServerToRunnerEvents, RunnerToServerEvents>
    private keepAliveInterval: NodeJS.Timeout | null = null
    private rpcHandlerManager: RpcHandlerManager
    private shuttingDown = false

    constructor(
        private readonly token: string,
        private readonly machine: Machine,
        private readonly options: ApiMachineClientOptions = {}
    ) {
        this.rpcHandlerManager = new RpcHandlerManager({
            scopePrefix: this.machine.id,
            logger: (msg, data) => logger.debug(msg, data),
        })
        registerCommonHandlers(this.rpcHandlerManager, getInvokedCwd())
        this.rpcHandlerManager.registerHandler('browse-directory', handleBrowseMachineDirectoryRequest)
        this.rpcHandlerManager.registerHandler('path-exists', handlePathExistsRequest)
    }

    setRPCHandlers({
        spawnSession,
        listLocalSessions,
        exportLocalSession,
        listAgentAvailability,
        stopSession,
        requestShutdown,
    }: MachineRpcHandlers): void {
        registerMachineRpcHandlers(this.rpcHandlerManager, {
            spawnSession,
            listLocalSessions,
            exportLocalSession,
            listAgentAvailability,
            stopSession,
            requestShutdown,
        })
    }

    async updateMachineMetadata(handler: (metadata: MachineMetadata | null) => MachineMetadata): Promise<void> {
        await backoff(async () => {
            const updated = handler(this.machine.metadata)

            const answer = (await this.socket.emitWithAck('machine-update-metadata', {
                machineId: this.machine.id,
                metadata: updated,
                expectedVersion: this.machine.metadataVersion,
            })) as unknown

            applyVersionedAck(answer, {
                valueKey: 'metadata',
                parseValue: (value) => {
                    const parsed = MachineMetadataSchema.safeParse(value)
                    return parsed.success ? parsed.data : null
                },
                applyValue: (value) => {
                    this.machine.metadata = value
                },
                applyVersion: (version) => {
                    this.machine.metadataVersion = version
                },
                logInvalidValue: (context, version) => {
                    const suffix = context === 'success' ? 'ack' : 'version-mismatch ack'
                    logger.debug(`[API MACHINE] Ignoring invalid metadata value from ${suffix}`, { version })
                },
                invalidResponseMessage: 'Invalid machine-update-metadata response',
                errorMessage: 'Machine metadata update failed',
                versionMismatchMessage: 'Metadata version mismatch',
            })
        })
    }

    async updateRunnerState(handler: (state: RunnerState | null) => RunnerState): Promise<void> {
        await backoff(async () => {
            const updated = handler(this.machine.runnerState)

            const answer = (await this.socket.emitWithAck('machine-update-state', {
                machineId: this.machine.id,
                runnerState: updated,
                expectedVersion: this.machine.runnerStateVersion,
            })) as unknown

            applyVersionedAck(answer, {
                valueKey: 'runnerState',
                parseValue: (value) => {
                    const parsed = RunnerStateSchema.safeParse(value)
                    return parsed.success ? parsed.data : null
                },
                applyValue: (value) => {
                    this.machine.runnerState = value
                },
                applyVersion: (version) => {
                    this.machine.runnerStateVersion = version
                },
                logInvalidValue: (context, version) => {
                    const suffix = context === 'success' ? 'ack' : 'version-mismatch ack'
                    logger.debug(`[API MACHINE] Ignoring invalid runnerState value from ${suffix}`, { version })
                },
                invalidResponseMessage: 'Invalid machine-update-state response',
                errorMessage: 'Machine state update failed',
                versionMismatchMessage: 'Runner state version mismatch',
            })
        })
    }

    private async syncMachineMetadataOnConnect(): Promise<void> {
        const nextMetadata = this.options.getMachineMetadata?.()
        if (!nextMetadata || machineMetadataMatches(this.machine.metadata, nextMetadata)) {
            return
        }

        await this.updateMachineMetadata(() => nextMetadata)
    }

    connect(): void {
        this.socket = io(`${configuration.apiUrl}/cli`, {
            transports: ['websocket'],
            auth: {
                token: this.token,
                clientType: 'machine-scoped' as const,
                machineId: this.machine.id,
            },
            path: '/socket.io/',
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        })
        bindMachineSocketHandlers({
            socket: this.socket,
            machine: this.machine,
            onRpcRequest: async (data, callback) => {
                callback(await this.rpcHandlerManager.handleRequest(data))
            },
            onConnect: () => {
                logger.debug('[API MACHINE] Connected to bot')
                this.rpcHandlerManager.onSocketConnect(this.socket)
                runDetachedTask(
                    () => this.syncMachineMetadataOnConnect(),
                    '[API MACHINE] Failed to sync machine metadata on connect'
                )
                runDetachedTask(
                    () =>
                        this.updateRunnerState((state) => ({
                            ...(state ?? {}),
                            status: 'running',
                            pid: process.pid,
                            httpPort: this.machine.runnerState?.httpPort,
                            startedAt: Date.now(),
                        })),
                    '[API MACHINE] Failed to update runner state on connect'
                )
                this.startKeepAlive()
            },
            onDisconnect: () => {
                logger.debug('[API MACHINE] Disconnected from bot')
                this.rpcHandlerManager.onSocketDisconnect()
                this.stopKeepAlive()
                if (!this.shuttingDown) {
                    logger.debug('[API MACHINE] Hub connection disappeared, waiting for Socket.IO reconnection')
                }
            },
            onRunnerUpdate: (update) => {
                if (update.metadata) {
                    const parsed = MachineMetadataSchema.safeParse(update.metadata.value)
                    if (parsed.success) {
                        this.machine.metadata = parsed.data
                    } else {
                        logger.debug('[API MACHINE] Ignoring invalid metadata update', {
                            version: update.metadata.version,
                        })
                    }
                    this.machine.metadataVersion = update.metadata.version
                }

                if (update.runnerState) {
                    const next = update.runnerState.value
                    if (next == null) {
                        this.machine.runnerState = null
                    } else {
                        const parsed = RunnerStateSchema.safeParse(next)
                        if (parsed.success) {
                            this.machine.runnerState = parsed.data
                        } else {
                            logger.debug('[API MACHINE] Ignoring invalid runnerState update', {
                                version: update.runnerState.version,
                            })
                        }
                    }
                    this.machine.runnerStateVersion = update.runnerState.version
                }
            },
        })

        this.socket.on('connect_error', (error) => {
            logger.debug(`[API MACHINE] Connection error: ${error.message}`)
        })

        this.socket.on('error', (payload) => {
            logger.debug('[API MACHINE] Socket error:', payload)
        })
    }

    private startKeepAlive(): void {
        this.stopKeepAlive()
        this.keepAliveInterval = setInterval(() => {
            this.socket.emit('machine-alive', {
                machineId: this.machine.id,
                time: Date.now(),
            })
        }, 20_000)
    }

    private stopKeepAlive(): void {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval)
            this.keepAliveInterval = null
        }
    }

    shutdown(): void {
        this.shuttingDown = true
        this.stopKeepAlive()
        if (this.socket) {
            this.socket.close()
        }
    }
}
