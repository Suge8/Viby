import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { HUB_RUNTIME_STATUS_FILE, type HubRuntimeStatus } from '@viby/protocol/runtimeStatus'
import { createHubProcessController } from './processController'
import { reportHubRuntimeError } from './runtimeDiagnostics'

export interface RunHubProcessOptions {
    onReady?(status: HubRuntimeStatus): Promise<void> | void
}

function resolveDataDir(): string {
    const raw = process.env.VIBY_HOME
    if (raw) return raw.replace(/^~/, homedir())
    return join(homedir(), '.viby')
}

async function readRuntimeStatus(): Promise<HubRuntimeStatus | null> {
    try {
        const raw = await readFile(join(resolveDataDir(), HUB_RUNTIME_STATUS_FILE), 'utf-8')
        return JSON.parse(raw) as HubRuntimeStatus
    } catch {
        return null
    }
}

export async function runHubProcess(options: RunHubProcessOptions = {}): Promise<void> {
    const controller = createHubProcessController()
    let shutdownRequested = false

    async function shutdownAndExit(): Promise<void> {
        const exitCode = await controller.shutdown()
        process.exit(exitCode)
    }

    function requestShutdown(): void {
        if (shutdownRequested) return
        shutdownRequested = true
        shutdownAndExit().catch((error) => {
            reportHubRuntimeError('Hub shutdown failed.', error)
            process.exit(1)
        })
    }

    process.on('SIGINT', requestShutdown)
    process.on('SIGTERM', requestShutdown)

    try {
        await controller.start()
        if (options.onReady) {
            const status = await readRuntimeStatus()
            if (status) {
                await options.onReady(status)
            }
        }
    } catch (error) {
        reportHubRuntimeError('Fatal hub error.', error)
        const exitCode = await controller.shutdown({
            exitCode: 1,
            logMessage: '\nShutting down after fatal error...',
            statusMessage: error instanceof Error ? error.message : String(error),
            statusPhase: 'error',
        })
        process.exit(exitCode)
    }
}
