import type { SpawnSessionResult } from '@/modules/common/rpcTypes'
import { logger } from '@/ui/logger'
import { spawnVibyCLI } from '@/utils/spawnVibyCLI'
import type { DriverSwitchHandoffTransport } from './driverSwitchHandoff'
import { stopTrackedSessionProcess } from './managedSessionLifecycle'
import { buildInternalSessionArgs } from './runArgs'
import { RUNNER_MANAGED_STARTED_BY, type TrackedSession } from './types'

type SpawnFailureDetails = {
    message: string
    pid?: number
    exitCode?: number | null
    signal?: NodeJS.Signals | null
}

type SpawnOutcome = { type: 'success' } | { type: 'error'; details: SpawnFailureDetails }

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
    reportSpawnOutcome: (outcome: SpawnOutcome) => void
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
        reportSpawnOutcome,
    } = options

    const MAX_TAIL_CHARS = 4000
    let stderrTail = ''
    const appendTail = (current: string, chunk: Buffer | string): string => {
        const text = chunk.toString()
        if (!text) {
            return current
        }
        const combined = current + text
        return combined.length > MAX_TAIL_CHARS ? combined.slice(-MAX_TAIL_CHARS) : combined
    }
    const logStderrTail = () => {
        const trimmed = stderrTail.trim()
        if (trimmed) {
            logger.debug('[RUNNER RUN] Child stderr tail', trimmed)
        }
    }

    const vibyProcess = spawnVibyCLI(args, {
        cwd,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
            ...env,
        },
    })

    vibyProcess.stderr?.on('data', (data) => {
        stderrTail = appendTail(stderrTail, data)
    })

    let spawnErrorBeforePidCheck: Error | null = null
    const captureSpawnErrorBeforePidCheck = (error: Error) => {
        spawnErrorBeforePidCheck = error
    }
    vibyProcess.once('error', captureSpawnErrorBeforePidCheck)

    if (!vibyProcess.pid) {
        await new Promise((resolve) => setImmediate(resolve))
        const details = [`cwd=${cwd}`]
        if (spawnErrorBeforePidCheck) {
            details.push(formatSpawnError(spawnErrorBeforePidCheck))
        }
        const errorMessage = `Failed to spawn VIBY process - no PID returned (${details.join('; ')})`
        reportSpawnOutcome({ type: 'error', details: { message: errorMessage } })
        await cleanupDriverSwitchTransport().catch((error) => {
            logger.debug('[RUNNER RUN] Failed to cleanup driver switch handoff after no-pid spawn failure', error)
        })
        await maybeCleanupWorktree('no-pid')
        return { type: 'error', errorMessage }
    }

    vibyProcess.removeListener('error', captureSpawnErrorBeforePidCheck)

    const pid = vibyProcess.pid
    let observedExitCode: number | null = null
    let observedExitSignal: NodeJS.Signals | null = null

    const buildWebhookFailureMessage = (
        reason: 'timeout' | 'exit-before-webhook' | 'process-error-before-webhook'
    ): string => {
        let message =
            reason === 'timeout'
                ? `Session webhook timeout for PID ${pid}`
                : reason === 'process-error-before-webhook'
                  ? `Session process error before webhook for PID ${pid}`
                  : `Session process exited before webhook for PID ${pid}`

        if (observedExitCode !== null || observedExitSignal) {
            message +=
                observedExitCode !== null ? ` (exit code ${observedExitCode})` : ` (signal ${observedExitSignal})`
        }

        const trimmedTail = stderrTail.trim()
        if (trimmedTail) {
            const compactTail = trimmedTail.replace(/\s+/g, ' ')
            const tailForMessage = compactTail.length > 800 ? compactTail.slice(-800) : compactTail
            message += `. stderr: ${tailForMessage}`
        }

        return message
    }

    const trackedSession: TrackedSession = {
        startedBy: RUNNER_MANAGED_STARTED_BY,
        pid,
        childProcess: vibyProcess,
        directoryCreated,
        message: directoryCreated
            ? `The path '${directory}' did not exist. We created a new folder and spawned a new session there.`
            : undefined,
    }

    pidToTrackedSession.set(pid, trackedSession)

    vibyProcess.on('exit', (code, signal) => {
        observedExitCode = typeof code === 'number' ? code : null
        observedExitSignal = signal ?? null
        if (code !== 0 || signal) {
            logStderrTail()
        }
        const errorAwaiter = pidToErrorAwaiter.get(pid)
        if (errorAwaiter) {
            pidToErrorAwaiter.delete(pid)
            pidToAwaiter.delete(pid)
            errorAwaiter(buildWebhookFailureMessage('exit-before-webhook'))
        }
        onChildExited(pid)
    })

    vibyProcess.on('error', (error) => {
        logger.debug('[RUNNER RUN] Child process error:', error)
        const errorAwaiter = pidToErrorAwaiter.get(pid)
        if (errorAwaiter) {
            pidToErrorAwaiter.delete(pid)
            pidToAwaiter.delete(pid)
            errorAwaiter(buildWebhookFailureMessage('process-error-before-webhook'))
        }
        onChildExited(pid)
    })

    const spawnResult = await new Promise<SpawnSessionResult>((resolve) => {
        const timeout = setTimeout(() => {
            pidToAwaiter.delete(pid)
            pidToErrorAwaiter.delete(pid)
            logStderrTail()
            resolve({
                type: 'error',
                errorMessage: buildWebhookFailureMessage('timeout'),
            })
        }, 15_000)

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
