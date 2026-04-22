import { listAgentAvailability } from '@/agent/agentAvailability'
import { buildMachineMetadata } from '@/agent/sessionFactory'
import { ApiClient } from '@/api/api'
import { RunnerState } from '@/api/types'
import { configuration } from '@/configuration'
import { exportLocalSession, listLocalSessions } from '@/modules/common/localSessions/localSessionRecovery'
import { acquireRunnerLock, RunnerLocallyPersistedState, releaseRunnerLock, writeRunnerState } from '@/persistence'
import { authAndSetupMachineIfNeeded } from '@/ui/auth'
import { getEnvironmentInfo } from '@/ui/doctor'
import { logger } from '@/ui/logger'
import { isRetryableConnectionError } from '@/utils/errorUtils'
import { withRetry } from '@/utils/time'
import packageJson from '../../package.json'
import { getInstalledCliMtimeMs } from './cliInstallStamp'
import { cleanupRunnerState, isRunnerRunningCurrentlyInstalledVibyVersion, stopRunner } from './controlClient'
import { startRunnerControlServer } from './controlServer'
import { stopRunnerManagedSessions } from './managedSessionLifecycle'
import { startRunnerHeartbeat } from './runnerHeartbeat'
import { hashRunnerCliApiToken } from './runnerIdentity'
import { createSpawnSessionHandler } from './runnerSessionSpawner'
import { createRunnerShutdownController } from './runnerShutdown'
import { createRunnerTrackedSessionControl } from './runnerTrackedSessionControl'
import { removeTrackedSession } from './trackedSessionRegistry'
import { TrackedSession } from './types'

export async function startRunner(): Promise<void> {
    const shutdownController = createRunnerShutdownController()
    const { requestShutdown } = shutdownController

    logger.debug('[RUNNER RUN] Starting runner process...')
    logger.debugLargeJson('[RUNNER RUN] Environment', getEnvironmentInfo())

    // Check if already running
    // Check if running runner version matches current CLI version
    const runningRunnerVersionMatches = await isRunnerRunningCurrentlyInstalledVibyVersion()
    if (!runningRunnerVersionMatches) {
        logger.debug('[RUNNER RUN] Runner version mismatch detected, restarting runner with current CLI version')
        await stopRunner()
    } else {
        logger.debug('[RUNNER RUN] Runner version matches, keeping existing runner')
        console.log('Runner already running with matching version')
        process.exit(0)
    }

    // Acquire exclusive lock (proves runner is running)
    const runnerLockHandle = await acquireRunnerLock(5, 200)
    if (!runnerLockHandle) {
        logger.debug('[RUNNER RUN] Runner lock file already held, another runner is running')
        process.exit(0)
    }

    // At this point we should be safe to startup the runner:
    // 1. Not have a stale runner state
    // 2. Should not have another runner process running

    try {
        // Ensure auth and machine registration BEFORE anything else
        const { machineId } = await authAndSetupMachineIfNeeded()
        logger.debug('[RUNNER RUN] Auth and machine setup complete')

        // Setup state - key by PID
        const pidToTrackedSession = new Map<number, TrackedSession>()
        const stopRequestedSessionPids = new Set<number>()

        // Session spawning awaiter system
        const pidToAwaiter = new Map<number, (session: TrackedSession) => void>()
        const pidToErrorAwaiter = new Map<number, (errorMessage: string) => void>()
        type SpawnFailureDetails = {
            message: string
            pid?: number
            exitCode?: number | null
            signal?: NodeJS.Signals | null
        }
        let reportSpawnOutcomeToHub:
            | ((outcome: { type: 'success' } | { type: 'error'; details: SpawnFailureDetails }) => void)
            | null = null

        const trackedSessionControl = createRunnerTrackedSessionControl({
            pidToTrackedSession,
            stopRequestedSessionPids,
            pidToAwaiter,
            pidToErrorAwaiter,
        })

        const spawnSession = createSpawnSessionHandler({
            pidToTrackedSession,
            pidToAwaiter,
            pidToErrorAwaiter,
            onChildExited: trackedSessionControl.onChildExited,
            reportSpawnOutcome: (outcome) => {
                reportSpawnOutcomeToHub?.(outcome)
            },
        })

        // Start control server
        const { port: controlPort, stop: stopControlServer } = await startRunnerControlServer({
            getChildren: trackedSessionControl.getCurrentChildren,
            stopSession: trackedSessionControl.stopSession,
            spawnSession,
            requestShutdown: () => requestShutdown('viby-cli'),
            onVibySessionWebhook: trackedSessionControl.onVibySessionWebhook,
        })

        const startedWithCliMtimeMs = getInstalledCliMtimeMs()

        // Write initial runner state (no lock needed for state file)
        const fileState: RunnerLocallyPersistedState = {
            pid: process.pid,
            httpPort: controlPort,
            startTime: new Date().toLocaleString(),
            startedWithCliVersion: packageJson.version,
            startedWithCliMtimeMs,
            startedWithApiUrl: configuration.apiUrl,
            startedWithMachineId: machineId,
            startedWithCliApiTokenHash: hashRunnerCliApiToken(configuration.cliApiToken),
            runnerLogPath: logger.logFilePath,
        }
        writeRunnerState(fileState)
        logger.debug('[RUNNER RUN] Runner state written')

        // Prepare initial runner state
        const initialRunnerState: RunnerState = {
            status: 'offline',
            pid: process.pid,
            httpPort: controlPort,
            startedAt: Date.now(),
        }
        const machineMetadata = buildMachineMetadata()

        // Create API client
        const api = await ApiClient.create()

        // Get or create machine (with retry for transient connection errors)
        const machine = await withRetry(
            () =>
                api.getOrCreateMachine({
                    machineId,
                    metadata: machineMetadata,
                    runnerState: initialRunnerState,
                }),
            {
                maxAttempts: 60,
                minDelay: 1000,
                maxDelay: 30000,
                shouldRetry: isRetryableConnectionError,
                onRetry: (error, attempt, nextDelayMs) => {
                    const errorMsg = error instanceof Error ? error.message : String(error)
                    logger.debug(
                        `[RUNNER RUN] Failed to register machine (attempt ${attempt}), retrying in ${nextDelayMs}ms: ${errorMsg}`
                    )
                },
            }
        )
        logger.debug(`[RUNNER RUN] Machine registered: ${machine.id}`)

        // Create realtime machine session
        const apiMachine = api.machineSyncClient(machine, {
            getMachineMetadata: buildMachineMetadata,
        })

        // Set RPC handlers
        apiMachine.setRPCHandlers({
            spawnSession,
            listLocalSessions,
            exportLocalSession,
            listAgentAvailability,
            stopSession: trackedSessionControl.stopSession,
            requestShutdown: () => requestShutdown('viby-app'),
        })

        // Connect to server
        apiMachine.connect()

        reportSpawnOutcomeToHub = (outcome) => {
            apiMachine
                .updateRunnerState((state: RunnerState | null) => {
                    const baseState: RunnerState = state ? { ...state } : { status: 'running' }

                    if (typeof baseState.pid !== 'number') {
                        baseState.pid = process.pid
                    }
                    if (typeof baseState.httpPort !== 'number') {
                        baseState.httpPort = controlPort
                    }
                    if (typeof baseState.startedAt !== 'number') {
                        baseState.startedAt = Date.now()
                    }

                    if (outcome.type === 'success') {
                        return {
                            ...baseState,
                            lastSpawnError: null,
                        }
                    }

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
                .catch((error) => {
                    logger.debug('[RUNNER RUN] Failed to update runner state with spawn outcome', error)
                })
        }

        // Every 60 seconds:
        // 1. Prune stale sessions
        // 2. Check if runner needs update
        // 3. If outdated, restart with latest version
        // 4. Write heartbeat
        const heartbeatIntervalMs = parseInt(process.env.VIBY_RUNNER_HEARTBEAT_INTERVAL || '60000')
        const runnerHeartbeat = startRunnerHeartbeat({
            intervalMs: heartbeatIntervalMs,
            runnerState: fileState,
            startedWithCliMtimeMs,
            getTrackedSessionPids: () => pidToTrackedSession.keys(),
            removeTrackedSession: (pid) => {
                removeTrackedSession(pidToTrackedSession, stopRequestedSessionPids, pid)
            },
            requestShutdown: (source, errorMessage) => {
                requestShutdown(source, errorMessage)
            },
        })

        // Setup signal handlers
        const cleanupAndShutdown = async (
            source: 'viby-app' | 'viby-cli' | 'os-signal' | 'exception',
            errorMessage?: string
        ) => {
            logger.debug(`[RUNNER RUN] Starting proper cleanup (source: ${source}, errorMessage: ${errorMessage})...`)

            // Clear health check interval
            runnerHeartbeat.stop()
            logger.debug('[RUNNER RUN] Health check interval cleared')

            // Update runner state before shutting down
            await apiMachine.updateRunnerState((state: RunnerState | null) => ({
                ...state,
                status: 'shutting-down',
                shutdownRequestedAt: Date.now(),
                shutdownSource: source,
            }))

            const managedSessionStopResult = await stopRunnerManagedSessions(pidToTrackedSession.values())
            for (const pid of managedSessionStopResult.stoppedPids) {
                removeTrackedSession(pidToTrackedSession, stopRequestedSessionPids, pid)
            }
            if (managedSessionStopResult.stoppedPids.length > 0) {
                logger.debug(
                    `[RUNNER RUN] Stopped ${managedSessionStopResult.stoppedPids.length} runner-managed session(s) before shutdown`
                )
            }
            if (managedSessionStopResult.failedPids.length > 0) {
                logger.debug(
                    '[RUNNER RUN] Failed to stop some runner-managed sessions before shutdown',
                    managedSessionStopResult.failedPids
                )
            }

            apiMachine.shutdown()
            await stopControlServer()
            await cleanupRunnerState()
            await releaseRunnerLock(runnerLockHandle)

            logger.debug('[RUNNER RUN] Cleanup completed, exiting process')
            process.exit(0)
        }

        logger.debug('[RUNNER RUN] Runner started successfully, waiting for shutdown request')

        // Wait for shutdown request
        const shutdownRequest = await shutdownController.waitForShutdownRequest()
        await cleanupAndShutdown(shutdownRequest.source, shutdownRequest.errorMessage)
    } catch (error) {
        logger.debug('[RUNNER RUN][FATAL] Failed somewhere unexpectedly - exiting with code 1', error)
        process.exit(1)
    }
}
