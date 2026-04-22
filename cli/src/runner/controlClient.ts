/**
 * HTTP client helpers for runner communication
 * Used by CLI commands to interact with running runner
 */

import { Metadata } from '@/api/types'
import { configuration } from '@/configuration'
import { clearRunnerState, type RunnerLocallyPersistedState, readRunnerState, readSettings } from '@/persistence'
import { logger } from '@/ui/logger'
import { isProcessAlive, killProcess } from '@/utils/process'
import packageJson from '../../package.json'
import { getInstalledCliMtimeMs } from './cliInstallStamp'
import { hashRunnerCliApiToken, isRunnerStateCompatibleWithIdentity } from './runnerIdentity'

const DEFAULT_RUNNER_HTTP_TIMEOUT_MS = 10_000
const RUNNER_STOP_TIMEOUT_MS = 2_000

type RunnerPostError = { error: string }
type SessionStartedResponse = { status: 'ok'; error?: string }
type ListSessionsResponse = {
    children: Array<{ startedBy: string; vibySessionId: string; pid: number }>
}
type StopSessionResponse = { success: boolean; error?: string }
type SpawnSessionResponse = {
    success: boolean
    sessionId: string
    approvedNewDirectoryCreation?: boolean
    requiresUserApproval?: boolean
    actionRequired?: string
    directory?: string
    error?: string
}

function getRunnerHttpTimeoutMs(): number {
    const configuredTimeout = process.env.VIBY_RUNNER_HTTP_TIMEOUT
    if (!configuredTimeout) {
        return DEFAULT_RUNNER_HTTP_TIMEOUT_MS
    }

    const parsedTimeout = Number.parseInt(configuredTimeout, 10)
    if (!Number.isFinite(parsedTimeout) || parsedTimeout <= 0) {
        return DEFAULT_RUNNER_HTTP_TIMEOUT_MS
    }

    return parsedTimeout
}

function doesRunnerCliInstallMatchCurrentInstall(state: RunnerLocallyPersistedState): boolean {
    const currentCliMtimeMs = getInstalledCliMtimeMs()
    if (typeof currentCliMtimeMs === 'number' && typeof state.startedWithCliMtimeMs === 'number') {
        logger.debug(
            `[RUNNER CONTROL] Current CLI mtime: ${currentCliMtimeMs}, Runner started with mtime: ${state.startedWithCliMtimeMs}`
        )
        return currentCliMtimeMs === state.startedWithCliMtimeMs
    }

    const currentCliVersion = packageJson.version
    logger.debug(
        `[RUNNER CONTROL] Current CLI version: ${currentCliVersion}, Runner started with version: ${state.startedWithCliVersion}`
    )
    return currentCliVersion === state.startedWithCliVersion
}

export async function resolveCurrentRunnerIdentity(): Promise<{
    apiUrl: string
    cliApiToken: string
    machineId?: string
}> {
    const settings = await readSettings()

    return {
        apiUrl: process.env.VIBY_API_URL || settings.apiUrl || configuration.apiUrl,
        cliApiToken: process.env.CLI_API_TOKEN || settings.cliApiToken || configuration.cliApiToken,
        machineId: settings.machineId,
    }
}

async function runnerPost<T>(path: string, body?: unknown): Promise<T> {
    const state = await readRunnerState()
    if (!state?.httpPort) {
        const errorMessage = 'No runner running, no state file found'
        logger.debug(`[CONTROL CLIENT] ${errorMessage}`)
        return {
            error: errorMessage,
        } as T
    }

    if (!isProcessAlive(state.pid)) {
        const errorMessage = 'Runner is not running, file is stale'
        logger.debug(`[CONTROL CLIENT] ${errorMessage}`)
        return {
            error: errorMessage,
        } as T
    }

    try {
        const timeoutMs = getRunnerHttpTimeoutMs()
        const response = await fetch(`http://127.0.0.1:${state.httpPort}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body ?? {}),
            // Mostly increased for stress test
            signal: AbortSignal.timeout(timeoutMs),
        })

        if (!response.ok) {
            const errorMessage = `Request failed: ${path}, HTTP ${response.status}`
            logger.debug(`[CONTROL CLIENT] ${errorMessage}`)
            return {
                error: errorMessage,
            } as T
        }

        return (await response.json()) as T
    } catch (error) {
        const errorMessage = `Request failed: ${path}, ${error instanceof Error ? error.message : 'Unknown error'}`
        logger.debug(`[CONTROL CLIENT] ${errorMessage}`)
        return {
            error: errorMessage,
        } as T
    }
}

export async function notifyRunnerSessionStarted(
    sessionId: string,
    metadata: Metadata
): Promise<SessionStartedResponse> {
    return await runnerPost<SessionStartedResponse>('/session-started', {
        sessionId,
        metadata,
    })
}

export async function listRunnerSessions(): Promise<ListSessionsResponse['children']> {
    const result = await runnerPost<ListSessionsResponse>('/list')
    if ('error' in result) {
        return []
    }
    return result.children ?? []
}

export async function stopRunnerSession(sessionId: string): Promise<boolean> {
    const result = await runnerPost<StopSessionResponse>('/stop-session', { sessionId })
    return 'error' in result ? false : Boolean(result.success)
}

export async function spawnRunnerSession(directory: string, sessionId?: string): Promise<SpawnSessionResponse> {
    const result = await runnerPost<SpawnSessionResponse>('/spawn-session', {
        directory,
        sessionId,
    })
    return result
}

export async function stopRunnerHttp(): Promise<void> {
    await runnerPost('/stop')
}

export async function checkIfRunnerRunningAndCleanupStaleState(): Promise<boolean> {
    const state = await readRunnerState()
    if (!state) {
        return false
    }

    // Check if the runner is running
    if (isProcessAlive(state.pid)) {
        return true
    }

    logger.debug('[RUNNER RUN] Runner PID not running, cleaning up state')
    await cleanupRunnerState()
    return false
}

/**
 * Check if the running runner version matches the current CLI version.
 * This should work from both the runner itself & a new CLI process.
 * Works via the runner.state.json file.
 *
 * @returns true if versions match, false if versions differ or no runner running
 */
export async function isRunnerRunningCurrentlyInstalledVibyVersion(): Promise<boolean> {
    logger.debug('[RUNNER CONTROL] Checking if runner is running same version')
    const runningRunner = await checkIfRunnerRunningAndCleanupStaleState()
    if (!runningRunner) {
        logger.debug('[RUNNER CONTROL] No runner running, returning false')
        return false
    }

    const state = await readRunnerState()
    if (!state) {
        logger.debug('[RUNNER CONTROL] No runner state found, returning false')
        return false
    }

    const currentIdentity = await resolveCurrentRunnerIdentity()

    try {
        if (!doesRunnerCliInstallMatchCurrentInstall(state)) {
            return false
        }

        const currentIdentityMatches = isRunnerStateCompatibleWithIdentity(state, {
            apiUrl: currentIdentity.apiUrl,
            machineId: currentIdentity.machineId,
            cliApiTokenHash: hashRunnerCliApiToken(currentIdentity.cliApiToken),
        })
        logger.debug(`[RUNNER CONTROL] Runner identity match: ${currentIdentityMatches}`, {
            currentApiUrl: currentIdentity.apiUrl,
            currentMachineId: currentIdentity.machineId,
            runnerStartedWithApiUrl: state.startedWithApiUrl,
            runnerStartedWithMachineId: state.startedWithMachineId,
        })
        return currentIdentityMatches
    } catch (error) {
        logger.debug('[RUNNER CONTROL] Error checking runner version', error)
        return false
    }
}

export async function cleanupRunnerState(): Promise<void> {
    try {
        await clearRunnerState()
        logger.debug('[RUNNER RUN] Runner state file removed')
    } catch (error) {
        logger.debug('[RUNNER RUN] Error cleaning up runner metadata', error)
    }
}

export async function stopRunner(): Promise<void> {
    try {
        const state = await readRunnerState()
        if (!state) {
            logger.debug('No runner state found')
            return
        }

        logger.debug(`Stopping runner with PID ${state.pid}`)

        // Try HTTP graceful stop
        try {
            await stopRunnerHttp()

            // Wait for runner to die
            await waitForProcessDeath(state.pid, RUNNER_STOP_TIMEOUT_MS)
            logger.debug('Runner stopped gracefully via HTTP')
            return
        } catch (error) {
            logger.debug('HTTP stop failed, will force kill', error)
        }

        // Force kill
        const killed = await killProcess(state.pid, true)
        if (killed) {
            logger.debug('Force killed runner')
        } else {
            logger.debug('Runner already dead or could not be killed')
        }
    } catch (error) {
        logger.debug('Error stopping runner', error)
    }
}

async function waitForProcessDeath(pid: number, timeout: number): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
        if (isProcessAlive(pid)) {
            await new Promise((resolve) => setTimeout(resolve, 100))
            continue
        }
        return // Process is dead
    }
    throw new Error('Process did not die within timeout')
}
