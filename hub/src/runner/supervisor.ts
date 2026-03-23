import { setTimeout as sleep } from 'node:timers/promises'

export type RunnerRecoveryMode = 'startup' | 'restart'

export type RunnerExitDetails = {
    code: number | null
    signal: NodeJS.Signals | null
}

export type RunnerRetryContext = {
    mode: RunnerRecoveryMode
    attempt: number
    delayMs: number
    error?: unknown
    exit?: RunnerExitDetails
}

type RecoverManagedRunnerOptions = {
    mode: RunnerRecoveryMode
    isShuttingDown: () => boolean
    hasRunnerProcess: () => boolean
    startRunner: () => Promise<void>
    cleanupRunner: () => Promise<void>
    onRetryScheduled: (context: RunnerRetryContext) => Promise<void> | void
    onRecovered: (mode: RunnerRecoveryMode) => Promise<void> | void
    sleepMs?: (delayMs: number) => Promise<void>
    exit?: RunnerExitDetails
}

const RUNNER_RESTART_BASE_DELAY_MS = 1_000
const RUNNER_RESTART_DELAY_MAX_MS = 30_000

export function getRunnerRestartDelayMs(attempt: number): number {
    const normalizedAttempt = Math.max(1, attempt)
    return Math.min(
        RUNNER_RESTART_DELAY_MAX_MS,
        RUNNER_RESTART_BASE_DELAY_MS * Math.pow(2, normalizedAttempt - 1)
    )
}

export async function recoverManagedRunner(options: RecoverManagedRunnerOptions): Promise<void> {
    const sleepMs = options.sleepMs ?? (async (delayMs: number): Promise<void> => {
        await sleep(delayMs)
    })
    let attempt = options.mode === 'restart' ? 1 : 0

    if (options.mode === 'restart') {
        await options.onRetryScheduled({
            mode: options.mode,
            attempt,
            delayMs: getRunnerRestartDelayMs(attempt),
            exit: options.exit
        })
    }

    while (!options.isShuttingDown() && !options.hasRunnerProcess()) {
        if (attempt > 0) {
            await sleepMs(getRunnerRestartDelayMs(attempt))
            if (options.isShuttingDown()) {
                return
            }
        }

        try {
            await options.startRunner()
            await options.onRecovered(options.mode)
            return
        } catch (error) {
            await options.cleanupRunner()
            if (options.isShuttingDown()) {
                return
            }

            attempt += 1
            await options.onRetryScheduled({
                mode: options.mode,
                attempt,
                delayMs: getRunnerRestartDelayMs(attempt),
                error
            })
        }
    }
}
