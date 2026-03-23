import { createHubProcessController } from './runtime/processController'

const controller = createHubProcessController()

async function shutdownAndExit(): Promise<void> {
    const exitCode = await controller.shutdown()
    process.exit(exitCode)
}

async function main(): Promise<void> {
    process.on('SIGINT', () => {
        void shutdownAndExit()
    })
    process.on('SIGTERM', () => {
        void shutdownAndExit()
    })

    await controller.start()
}

void main().catch(async (error) => {
    console.error('Fatal error:', error)

    const exitCode = await controller.shutdown({
        exitCode: 1,
        logMessage: '\nShutting down after fatal error...',
        statusMessage: error instanceof Error ? error.message : String(error),
        statusPhase: 'error'
    })
    process.exit(exitCode)
})
