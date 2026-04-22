import { createHubProcessController } from './runtime/processController'
import { reportHubRuntimeError } from './runtime/runtimeDiagnostics'

const controller = createHubProcessController()
let shutdownRequested = false

async function shutdownAndExit(): Promise<void> {
    const exitCode = await controller.shutdown()
    process.exit(exitCode)
}

function requestShutdown(): void {
    if (shutdownRequested) {
        return
    }

    shutdownRequested = true
    shutdownAndExit().catch((error) => {
        reportHubRuntimeError('Hub shutdown failed.', error)
        process.exit(1)
    })
}

async function main(): Promise<void> {
    process.on('SIGINT', requestShutdown)
    process.on('SIGTERM', requestShutdown)

    await controller.start()
}

main().catch(async (error) => {
    reportHubRuntimeError('Fatal hub error.', error)

    const exitCode = await controller.shutdown({
        exitCode: 1,
        logMessage: '\nShutting down after fatal error...',
        statusMessage: error instanceof Error ? error.message : String(error),
        statusPhase: 'error',
    })
    process.exit(exitCode)
})
