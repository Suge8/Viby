import type { Metadata } from '@/api/types'
import type { SpawnSessionResult } from '@/modules/common/rpcTypes'
import { PROVIDER_ADAPTER_EVENTS_STDOUT_ENV } from '@/runtime/providerAdapterProtocol'
import { logger } from '@/ui/logger'
import { spawnInternalRuntime } from '@/utils/spawnInternalRuntime'
import type { HubRuntimeCore } from '../../../../hub/src/runtime/core'
import type { DirectRuntimeRegistry } from '../../../../hub/src/runtime/directRuntimeRegistry'
import type { DriverSwitchHandoffTransport } from './driverSwitchHandoff'
import { stopTrackedSessionProcess } from './managedSessionLifecycle'
import { ProviderAdapterBridge } from './providerAdapterBridge'
import { ProviderAdapterStdoutProcessor } from './providerAdapterStdoutProcessor'
import { buildInternalSessionArgs } from './sessionArgs'
import { buildSessionStartFailureMessage, createStderrTail, type SpawnStartFailureReason } from './spawnFailureMessage'
import { APP_CORE_MANAGED_STARTED_BY, type TrackedSession } from './types'

type SpawnFailureDetails = {
    message: string
    pid?: number
    exitCode?: number | null
    signal?: NodeJS.Signals | null
}

type SpawnOutcome = { type: 'success' } | { type: 'error'; details: SpawnFailureDetails }
const DEFAULT_SESSION_START_TIMEOUT_MS = 20_000
export const APP_CORE_SESSION_START_TIMEOUT_ENV = 'VIBY_APP_CORE_SESSION_START_TIMEOUT_MS'

export function resolveSessionStartedTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
    const parsed = Number(env[APP_CORE_SESSION_START_TIMEOUT_ENV])
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_START_TIMEOUT_MS
}

function formatSpawnError(error: unknown): string {
    if (error instanceof Error) {
        return error.message
    }
    return String(error)
}

export function buildSpawnArgs(
    agent: string,
    options: {
        resumeSessionId?: string
        sessionId?: string
        permissionMode?: string
        model?: string
        modelReasoningEffort?: string | null
        codexServiceTier?: string | null
        collaborationMode?: string | null
        driverSwitchTransport: DriverSwitchHandoffTransport | null
    }
): string[] {
    return buildInternalSessionArgs(agent as never, options as never)
}

export async function spawnChildProcess(options: {
    args: string[]
    cwd: string
    env: Record<string, string>
    directory: string
    directoryCreated: boolean
    cleanupDriverSwitchTransport: () => Promise<void>
    maybeCleanupWorktree: (reason: string, pid?: number | null) => Promise<void>
    pidToTrackedSession: Map<number, TrackedSession>
    pidToAwaiter: Map<number, (session: TrackedSession) => void>
    pidToErrorAwaiter: Map<number, (errorMessage: string) => void>
    onChildExited: (pid: number) => void
    onSessionStarted: (sessionId: string, metadata: Metadata) => void
    reportSpawnOutcome: (outcome: SpawnOutcome) => void
    directRuntimeRegistry: DirectRuntimeRegistry
    getRuntimeCore: () => HubRuntimeCore | null
}): Promise<SpawnSessionResult> {
    const {
        args,
        cwd,
        env,
        directory,
        directoryCreated,
        cleanupDriverSwitchTransport,
        maybeCleanupWorktree,
        pidToTrackedSession,
        pidToAwaiter,
        pidToErrorAwaiter,
        onChildExited,
        onSessionStarted,
        reportSpawnOutcome,
        directRuntimeRegistry,
        getRuntimeCore,
    } = options

    const stderrTail = createStderrTail()

    const runtimeProcess = spawnInternalRuntime(args, {
        cwd,
        detached: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
            ...process.env,
            ...env,
            [PROVIDER_ADAPTER_EVENTS_STDOUT_ENV]: '1',
        },
    })

    runtimeProcess.stderr?.on('data', (data) => stderrTail.append(data))

    let spawnErrorBeforePidCheck: Error | null = null
    const captureSpawnErrorBeforePidCheck = (error: Error) => {
        spawnErrorBeforePidCheck = error
    }
    runtimeProcess.once('error', captureSpawnErrorBeforePidCheck)

    if (!runtimeProcess.pid) {
        await new Promise((resolve) => setImmediate(resolve))
        const details = [`cwd=${cwd}`]
        if (spawnErrorBeforePidCheck) {
            details.push(formatSpawnError(spawnErrorBeforePidCheck))
        }
        const errorMessage = `Failed to spawn internal runtime process - no PID returned (${details.join('; ')})`
        reportSpawnOutcome({ type: 'error', details: { message: errorMessage } })
        await cleanupDriverSwitchTransport().catch((error) => {
            logger.debug(
                '[RuntimeSupervisor] Failed to cleanup driver switch handoff after no-pid spawn failure',
                error
            )
        })
        await maybeCleanupWorktree('no-pid')
        return { type: 'error', errorMessage }
    }

    runtimeProcess.removeListener('error', captureSpawnErrorBeforePidCheck)

    const pid = runtimeProcess.pid
    const sessionStartedTimeoutMs = resolveSessionStartedTimeoutMs()
    let observedExitCode: number | null = null
    let observedExitSignal: NodeJS.Signals | null = null

    const buildWebhookFailureMessage = (reason: SpawnStartFailureReason) =>
        buildSessionStartFailureMessage({
            pid,
            reason,
            stderrTail: stderrTail.readForMessage(),
            exit: { exitCode: observedExitCode, signal: observedExitSignal },
        })

    const trackedSession: TrackedSession = {
        startedBy: APP_CORE_MANAGED_STARTED_BY,
        pid,
        childProcess: runtimeProcess,
        directoryCreated,
        message: directoryCreated
            ? `The path '${directory}' did not exist. We created a new folder and spawned a new session there.`
            : undefined,
    }

    const adapterBridge = new ProviderAdapterBridge(runtimeProcess, directRuntimeRegistry, getRuntimeCore)
    trackedSession.adapterBridge = adapterBridge
    pidToTrackedSession.set(pid, trackedSession)

    let protocolFailureReported = false
    const reportProviderProtocolFailure = (message: string): void => {
        if (protocolFailureReported) return
        protocolFailureReported = true
        const errorMessage = `Provider adapter protocol failed for PID ${pid}: ${message}`
        logger.debug('[RuntimeSupervisor] Provider adapter protocol failure', errorMessage)
        const errorAwaiter = pidToErrorAwaiter.get(pid)
        if (errorAwaiter) {
            pidToErrorAwaiter.delete(pid)
            pidToAwaiter.delete(pid)
            trackedSession.spawnAbandoned = true
            errorAwaiter(errorMessage)
        }
        stopTrackedSessionProcess(trackedSession).catch((error) => {
            logger.debug('[RuntimeSupervisor] Failed to stop provider after protocol failure', error)
        })
    }

    const stdoutProcessor = new ProviderAdapterStdoutProcessor({
        bridge: adapterBridge,
        onSessionStarted,
        onFatal: reportProviderProtocolFailure,
        pause: () => runtimeProcess.stdout?.pause?.(),
        resume: () => runtimeProcess.stdout?.resume?.(),
    })

    runtimeProcess.stdout?.on('data', (data) => stdoutProcessor.push(data))
    runtimeProcess.stdout?.on('end', () => stdoutProcessor.finish())

    runtimeProcess.on('exit', (code, signal) => {
        observedExitCode = typeof code === 'number' ? code : null
        observedExitSignal = signal ?? null
        if (code !== 0 || signal) stderrTail.log()
        const errorAwaiter = pidToErrorAwaiter.get(pid)
        if (errorAwaiter) {
            pidToErrorAwaiter.delete(pid)
            pidToAwaiter.delete(pid)
            errorAwaiter(buildWebhookFailureMessage('exit-before-session-start event'))
        }
        stdoutProcessor.dispose()
        adapterBridge.dispose()
        onChildExited(pid)
    })

    runtimeProcess.on('error', (error) => {
        logger.debug('[RuntimeSupervisor] Child process error:', error)
        const errorAwaiter = pidToErrorAwaiter.get(pid)
        if (errorAwaiter) {
            pidToErrorAwaiter.delete(pid)
            pidToAwaiter.delete(pid)
            errorAwaiter(buildWebhookFailureMessage('process-error-before-session-start event'))
        }
        stdoutProcessor.dispose()
        adapterBridge.dispose()
        onChildExited(pid)
    })

    const spawnResult = await new Promise<SpawnSessionResult>((resolve) => {
        const timeout = setTimeout(() => {
            pidToAwaiter.delete(pid)
            pidToErrorAwaiter.delete(pid)
            trackedSession.spawnAbandoned = true
            runtimeProcess.once('exit', () => {
                maybeCleanupWorktree('spawn-timeout-exit').catch((error) => {
                    logger.debug('[RuntimeSupervisor] Failed to cleanup worktree after timed-out spawn exit', error)
                })
            })
            stopTrackedSessionProcess(trackedSession).catch((error) => {
                logger.debug('[RuntimeSupervisor] Failed to stop timed-out spawn', error)
            })
            stderrTail.log()
            resolve({
                type: 'error',
                errorMessage: buildWebhookFailureMessage('timeout'),
            })
        }, sessionStartedTimeoutMs)

        pidToAwaiter.set(pid, (completedSession) => {
            clearTimeout(timeout)
            pidToErrorAwaiter.delete(pid)
            resolve({
                type: 'success',
                sessionId: completedSession.vibySessionId!,
            })
        })
        pidToErrorAwaiter.set(pid, (errorMessage) => {
            clearTimeout(timeout)
            resolve({
                type: 'error',
                errorMessage,
            })
        })
    })

    if (spawnResult.type === 'error') {
        reportSpawnOutcome({
            type: 'error',
            details: {
                message: spawnResult.errorMessage,
                pid,
                exitCode: observedExitCode,
                signal: observedExitSignal,
            },
        })
        await maybeCleanupWorktree('spawn-error', pid)
    } else {
        reportSpawnOutcome({ type: 'success' })
    }

    try {
        await cleanupDriverSwitchTransport()
    } catch (error) {
        const cleanupErrorMessage = `Driver switch transport cleanup failed: ${formatSpawnError(error)}`
        if (spawnResult.type === 'success') {
            await stopTrackedSessionProcess(trackedSession)
            pidToTrackedSession.delete(pid)
        }
        reportSpawnOutcome({
            type: 'error',
            details: {
                message: cleanupErrorMessage,
                pid,
                exitCode: observedExitCode,
                signal: observedExitSignal,
            },
        })
        await maybeCleanupWorktree('driver-switch-cleanup-error', pid)
        return { type: 'error', errorMessage: cleanupErrorMessage }
    }

    return spawnResult
}
