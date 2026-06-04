import { listAgentAvailability } from '@/agent/agentAvailability'
import {
    loadAgentConfigFiles,
    openAgentConfigFile,
    restoreAgentConfigFile,
    saveAgentConfigFile,
} from '@/agent/agentConfigFiles'
import { buildMachineMetadata } from '@/agent/sessionFactory'
import { handleBrowseMachineDirectoryRequest } from '@/api/machineDirectoryBrowser'
import { registerMachineRpcHandlers } from '@/api/machineRpcHandlers'
import { handlePathExistsRequest } from '@/api/pathExistsHandler'
import { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import type { RuntimeState } from '@/api/types'
import { configuration } from '@/configuration'
import { exportLocalSession, listLocalSessions } from '@/modules/common/localSessions/localSessionRecovery'
import { registerCommonHandlers } from '@/modules/common/registerCommonHandlers'
import { authAndSetupMachineIfNeeded } from '@/ui/auth'
import { logger } from '@/ui/logger'
import { getInvokedCwd } from '@/utils/invokedCwd'
import type { HubRuntimeCore } from '../../../hub/src/runtime/core'
import type { LocalRuntimeControllerFactory } from '../../../hub/src/runtime/localRuntimeController'
import { stopAppCoreManagedSessions } from './session/managedSessionLifecycle'
import { createSpawnSessionHandler } from './session/sessionSpawner'
import { createRuntimeSessionTracker } from './session/trackedSessionControl'
import type { TrackedSession } from './session/types'

type SpawnFailureDetails = {
    message: string
    pid?: number
    exitCode?: number | null
    signal?: NodeJS.Signals | null
}

type SpawnOutcome = { type: 'success' } | { type: 'error'; details: SpawnFailureDetails }

function applyHubRuntimeConfig(options: Parameters<LocalRuntimeControllerFactory>[0]): void {
    configuration._setApiUrl(options.localHubUrl)
    configuration._setHubOwnerToken(options.hubOwnerToken)
}

function buildInitialRuntimeState(): RuntimeState {
    return {
        status: 'running',
        pid: process.pid,
        startedAt: Date.now(),
    }
}

export const createAppCoreRuntimeController: LocalRuntimeControllerFactory = (options) => {
    let startPromise: Promise<void> | null = null
    let started = false
    let runtimeCore: HubRuntimeCore | null = null
    let machineId: string | null = null
    let directMachineTargetId: string | null = null
    let machineKeepAliveTimer: ReturnType<typeof setInterval> | null = null
    let unsubscribeSyncEvents: (() => void) | null = null

    const pidToTrackedSession = new Map<number, TrackedSession>()
    const stopRequestedSessionPids = new Set<number>()
    const pidToAwaiter = new Map<number, (session: TrackedSession) => void>()
    const pidToErrorAwaiter = new Map<number, (errorMessage: string) => void>()

    const trackedSessionControl = createRuntimeSessionTracker({
        pidToTrackedSession,
        stopRequestedSessionPids,
        pidToAwaiter,
        pidToErrorAwaiter,
    })

    function requireRuntimeCore(): HubRuntimeCore {
        if (!runtimeCore) throw new Error('AppCore runtime core is not attached.')
        return runtimeCore
    }

    function updateMachineRuntimeState(handler: (state: RuntimeState | null) => RuntimeState): void {
        if (!machineId || !runtimeCore) return
        const current = (runtimeCore.syncEngine.getMachine(machineId)?.runtimeState as RuntimeState | null) ?? null
        runtimeCore.syncEngine.updateMachineRuntimeState(machineId, handler(current))
    }

    function emitMachineAlive(): void {
        if (!machineId || !runtimeCore) return
        runtimeCore.syncEngine.handleMachineAlive({ machineId, time: Date.now() })
    }

    function startMachineKeepAlive(): void {
        stopMachineKeepAlive()
        machineKeepAliveTimer = setInterval(emitMachineAlive, 20_000)
        machineKeepAliveTimer.unref?.()
    }

    function stopMachineKeepAlive(): void {
        if (!machineKeepAliveTimer) return
        clearInterval(machineKeepAliveTimer)
        machineKeepAliveTimer = null
    }

    function updateSpawnOutcome(outcome: SpawnOutcome): void {
        try {
            updateMachineRuntimeState((state) => {
                const baseState: RuntimeState = state ? { ...state } : buildInitialRuntimeState()
                if (outcome.type === 'success') return { ...baseState, lastSpawnError: null }
                return {
                    ...baseState,
                    lastSpawnError: {
                        message: outcome.details.message,
                        pid: outcome.details.pid,
                        exitCode: outcome.details.exitCode ?? null,
                        signal: outcome.details.signal ?? null,
                        at: Date.now(),
                    },
                }
            })
        } catch (error) {
            logger.debug('[RuntimeSupervisor] Failed to update spawn outcome', error)
        }
    }

    const spawnSession = createSpawnSessionHandler({
        pidToTrackedSession,
        pidToAwaiter,
        pidToErrorAwaiter,
        onChildExited: trackedSessionControl.onChildExited,
        onSessionStarted: trackedSessionControl.onVibySessionWebhook,
        reportSpawnOutcome: updateSpawnOutcome,
        directRuntimeRegistry: options.directRuntimeRegistry,
        getRuntimeCore: () => runtimeCore,
    })

    function registerDirectMachineRpc(targetMachineId: string): string {
        const targetId = `machine:${targetMachineId}`
        const rpcHandlerManager = new RpcHandlerManager({
            scopePrefix: targetMachineId,
            logger: (message, payload) => logger.debug(message, payload),
        })
        registerCommonHandlers(rpcHandlerManager, getInvokedCwd())
        rpcHandlerManager.registerHandler('browse-directory', handleBrowseMachineDirectoryRequest)
        rpcHandlerManager.registerHandler('path-exists', handlePathExistsRequest)
        registerMachineRpcHandlers(rpcHandlerManager, {
            spawnSession,
            listLocalSessions,
            exportLocalSession,
            listAgentAvailability,
            loadAgentConfigFiles,
            saveAgentConfigFile,
            restoreAgentConfigFile,
            openAgentConfigFile,
            stopSession: trackedSessionControl.stopSession,
            requestShutdown: options.requestShutdown,
        })

        const target = {
            id: targetId,
            send: () => false,
            callRpc: async (method: string, params: unknown) =>
                await rpcHandlerManager.handleRequest({ method, params: JSON.stringify(params) }),
        }
        for (const method of rpcHandlerManager.listMethods()) {
            options.directRuntimeRegistry.registerRpc(method, target)
        }
        return targetId
    }

    async function startRuntime(): Promise<void> {
        applyHubRuntimeConfig(options)
        await options.writeRuntimeStatus({
            phase: 'starting',
            preferredBrowserUrl: options.preferredBrowserUrl,
            message: options.buildStartingStatusMessage('正在启动本机运行时…'),
        })

        const core = requireRuntimeCore()
        const identity = await authAndSetupMachineIfNeeded()
        machineId = identity.machineId
        core.syncEngine.getOrCreateMachine(machineId, buildMachineMetadata(), buildInitialRuntimeState())
        core.syncEngine.updateMachineMetadata(machineId, buildMachineMetadata())
        core.syncEngine.updateMachineRuntimeState(machineId, buildInitialRuntimeState())
        directMachineTargetId = registerDirectMachineRpc(machineId)
        emitMachineAlive()
        startMachineKeepAlive()

        started = true
        await options.writeRuntimeStatus({
            phase: 'ready',
            preferredBrowserUrl: options.preferredBrowserUrl,
            message: options.buildReadyStatusMessage(),
        })
    }

    return {
        reload(nextRuntimeCore: HubRuntimeCore | null): void {
            runtimeCore = nextRuntimeCore
            unsubscribeSyncEvents?.()
            unsubscribeSyncEvents =
                nextRuntimeCore?.syncEngine.subscribe((event) => {
                    if (event.type !== 'message-received' && event.type !== 'messages-canceled') return
                    const target = Array.from(pidToTrackedSession.values()).find(
                        (session) => session.vibySessionId === event.sessionId
                    )
                    if (!target?.adapterBridge) return
                    if (event.type === 'message-received') {
                        target.adapterBridge.send({
                            type: 'runtime.session-message',
                            sessionId: event.sessionId,
                            message: event.message,
                        })
                    } else {
                        target.adapterBridge.send({
                            type: 'runtime.cancel-messages',
                            sessionId: event.sessionId,
                            localIds: event.localIds,
                        })
                    }
                }) ?? null
        },
        async start(): Promise<void> {
            if (!startPromise) startPromise = startRuntime()
            await startPromise
        },
        async stop(): Promise<string | null> {
            if (!started && !startPromise) return null
            const targetId = directMachineTargetId
            startPromise = null
            started = false

            try {
                updateMachineRuntimeState((state) => ({
                    ...(state ?? {}),
                    status: 'shutting-down',
                    shutdownRequestedAt: Date.now(),
                    shutdownSource: 'runtime',
                }))
                const stopResult = await stopAppCoreManagedSessions(pidToTrackedSession.values())
                if (stopResult.failedPids.length > 0) {
                    return `Failed to stop runtime child processes: ${stopResult.failedPids.join(', ')}`
                }
                return null
            } finally {
                stopMachineKeepAlive()
                if (targetId) options.directRuntimeRegistry.unregisterTarget(targetId)
                directMachineTargetId = null
                machineId = null
            }
        },
    }
}
