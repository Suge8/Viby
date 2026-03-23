import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'

export const LIVE_INTEGRATION_ENABLED = process.env.VIBY_RUNNER_INTEGRATION === '1'
export const LIVE_API_URL = process.env.VIBY_RUNNER_INTEGRATION_API_URL ?? process.env.VIBY_API_URL ?? ''
export const LIVE_CLI_API_TOKEN = process.env.VIBY_RUNNER_INTEGRATION_CLI_API_TOKEN ?? process.env.CLI_API_TOKEN ?? ''
export const LIVE_INTEGRATION_READY = LIVE_INTEGRATION_ENABLED && LIVE_API_URL.length > 0 && LIVE_CLI_API_TOKEN.length > 0
export const RUNNER_HOOK_TIMEOUT_MS = 30_000
export const RUNNER_START_TIMEOUT_MS = 10_000
export const RUNNER_START_POLL_INTERVAL_MS = 250
export const RUNNER_MANAGED_SESSION_SETTLE_MS = 1_000
export const EXTERNAL_SESSION_BOOT_MS = 5_000
export const RUNNER_SIGKILL_SETTLE_MS = 500
export const RUNNER_GRACEFUL_SHUTDOWN_SETTLE_MS = 4_000

const ORIGINAL_ENV = {
    VIBY_HOME: process.env.VIBY_HOME,
    VIBY_API_URL: process.env.VIBY_API_URL,
    CLI_API_TOKEN: process.env.CLI_API_TOKEN,
}

export type RunnerModules = {
    configuration: typeof import('@/configuration').configuration
    listRunnerSessions: typeof import('@/runner/controlClient').listRunnerSessions
    stopRunnerSession: typeof import('@/runner/controlClient').stopRunnerSession
    spawnRunnerSession: typeof import('@/runner/controlClient').spawnRunnerSession
    stopRunnerHttp: typeof import('@/runner/controlClient').stopRunnerHttp
    notifyRunnerSessionStarted: typeof import('@/runner/controlClient').notifyRunnerSessionStarted
    stopRunner: typeof import('@/runner/controlClient').stopRunner
    readRunnerState: typeof import('@/persistence').readRunnerState
    clearRunnerState: typeof import('@/persistence').clearRunnerState
    spawnVibyCLI: typeof import('@/utils/spawnVibyCLI').spawnVibyCLI
    getLatestRunnerLog: typeof import('@/ui/logger').getLatestRunnerLog
    isProcessAlive: typeof import('@/utils/process').isProcessAlive
    isWindows: typeof import('@/utils/process').isWindows
    killProcess: typeof import('@/utils/process').killProcess
    killProcessByChildProcess: typeof import('@/utils/process').killProcessByChildProcess
    RUNNER_MANAGED_STARTED_BY: typeof import('./types').RUNNER_MANAGED_STARTED_BY
    EXTERNAL_TERMINAL_STARTED_BY: typeof import('./types').EXTERNAL_TERMINAL_STARTED_BY
    stringifyVibyLocalSettingsToml: typeof import('@viby/protocol/localSettings').stringifyVibyLocalSettingsToml
}

let runnerModules: RunnerModules | null = null
let testVibyHome = ''

export function getRunnerModules(): RunnerModules {
    if (!runnerModules) {
        throw new Error('Runner integration modules are not initialized.')
    }
    return runnerModules
}

export async function waitFor(
    condition: () => Promise<boolean>,
    timeout = 5_000,
    interval = 100
): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
        if (await condition()) {
            return
        }
        await new Promise((resolve) => setTimeout(resolve, interval))
    }
    throw new Error('Timeout waiting for condition')
}

async function isServerHealthy(apiUrl: string, cliApiToken: string): Promise<boolean> {
    try {
        const response = await fetch(`${apiUrl}/cli/machines/__healthcheck__`, {
            headers: { Authorization: `Bearer ${cliApiToken}` },
            signal: AbortSignal.timeout(1_000)
        })

        if (response.status === 401) {
            console.log('[TEST] Bot health check failed: invalid CLI_API_TOKEN')
            return false
        }
        if (response.status === 503) {
            console.log('[TEST] Bot health check failed: bot not ready (503)')
            return false
        }

        return response.ok
    } catch (error) {
        console.log('[TEST] Bot not reachable:', error)
        return false
    }
}

async function loadRunnerModules(): Promise<RunnerModules> {
    const { configuration } = await import('@/configuration')
    const controlClient = await import('@/runner/controlClient')
    const persistence = await import('@/persistence')
    const spawnUtils = await import('@/utils/spawnVibyCLI')
    const logger = await import('@/ui/logger')
    const processUtils = await import('@/utils/process')
    const runnerTypes = await import('./types')
    const localSettings = await import('@viby/protocol/localSettings')

    return {
        configuration,
        listRunnerSessions: controlClient.listRunnerSessions,
        stopRunnerSession: controlClient.stopRunnerSession,
        spawnRunnerSession: controlClient.spawnRunnerSession,
        stopRunnerHttp: controlClient.stopRunnerHttp,
        notifyRunnerSessionStarted: controlClient.notifyRunnerSessionStarted,
        stopRunner: controlClient.stopRunner,
        readRunnerState: persistence.readRunnerState,
        clearRunnerState: persistence.clearRunnerState,
        spawnVibyCLI: spawnUtils.spawnVibyCLI,
        getLatestRunnerLog: logger.getLatestRunnerLog,
        isProcessAlive: processUtils.isProcessAlive,
        isWindows: processUtils.isWindows,
        killProcess: processUtils.killProcess,
        killProcessByChildProcess: processUtils.killProcessByChildProcess,
        RUNNER_MANAGED_STARTED_BY: runnerTypes.RUNNER_MANAGED_STARTED_BY,
        EXTERNAL_TERMINAL_STARTED_BY: runnerTypes.EXTERNAL_TERMINAL_STARTED_BY,
        stringifyVibyLocalSettingsToml: localSettings.stringifyVibyLocalSettingsToml
    }
}

function restoreEnvironmentVariable(name: 'VIBY_HOME' | 'VIBY_API_URL' | 'CLI_API_TOKEN', value: string | undefined): void {
    if (value === undefined) {
        delete process.env[name]
        return
    }
    process.env[name] = value
}

export async function setupRunnerIntegrationHarness(): Promise<void> {
    testVibyHome = mkdtempSync(join(tmpdir(), 'viby-runner-integration-'))
    process.env.VIBY_HOME = testVibyHome
    process.env.VIBY_API_URL = LIVE_API_URL
    process.env.CLI_API_TOKEN = LIVE_CLI_API_TOKEN

    runnerModules = await loadRunnerModules()
    const { stringifyVibyLocalSettingsToml } = getRunnerModules()

    writeFileSync(
        join(testVibyHome, 'settings.toml'),
        stringifyVibyLocalSettingsToml({
            apiUrl: LIVE_API_URL,
            cliApiToken: LIVE_CLI_API_TOKEN,
            machineId: randomUUID(),
            machineIdConfirmedByServer: false
        })
    )

    const healthy = await isServerHealthy(LIVE_API_URL, LIVE_CLI_API_TOKEN)
    if (!healthy) {
        throw new Error('Runner integration env is enabled, but the target hub is not healthy.')
    }
}

export function teardownRunnerIntegrationHarness(): void {
    restoreEnvironmentVariable('VIBY_HOME', ORIGINAL_ENV.VIBY_HOME)
    restoreEnvironmentVariable('VIBY_API_URL', ORIGINAL_ENV.VIBY_API_URL)
    restoreEnvironmentVariable('CLI_API_TOKEN', ORIGINAL_ENV.CLI_API_TOKEN)
    runnerModules = null

    if (testVibyHome) {
        rmSync(testVibyHome, { recursive: true, force: true })
        testVibyHome = ''
    }
}
