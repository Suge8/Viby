import { logger } from '@/ui/logger'
import { isWindows } from '@/utils/process'

export type RunnerShutdownSource = 'viby-app' | 'viby-cli' | 'os-signal' | 'exception'

export type RunnerShutdownRequest = {
    source: RunnerShutdownSource
    errorMessage?: string
}

export type RunnerShutdownController = {
    requestShutdown: (source: RunnerShutdownSource, errorMessage?: string) => void
    waitForShutdownRequest: () => Promise<RunnerShutdownRequest>
}

export function createRunnerShutdownController(): RunnerShutdownController {
    let requestShutdown!: (source: RunnerShutdownSource, errorMessage?: string) => void
    const shutdownRequested = new Promise<RunnerShutdownRequest>((resolve) => {
        requestShutdown = (source, errorMessage) => {
            logger.debug(`[RUNNER RUN] Requesting shutdown (source: ${source}, errorMessage: ${errorMessage})`)

            setTimeout(async () => {
                logger.debug('[RUNNER RUN] Startup malfunctioned, forcing exit with code 1')
                await new Promise((timerResolve) => setTimeout(timerResolve, 100))
                process.exit(1)
            }, 1_000)

            resolve({ source, errorMessage })
        }
    })

    process.on('SIGINT', () => {
        logger.debug('[RUNNER RUN] Received SIGINT')
        requestShutdown('os-signal')
    })

    process.on('SIGTERM', () => {
        logger.debug('[RUNNER RUN] Received SIGTERM')
        requestShutdown('os-signal')
    })

    if (isWindows()) {
        process.on('SIGBREAK', () => {
            logger.debug('[RUNNER RUN] Received SIGBREAK')
            requestShutdown('os-signal')
        })
    }

    process.on('uncaughtException', (error) => {
        logger.debug('[RUNNER RUN] FATAL: Uncaught exception', error)
        logger.debug(`[RUNNER RUN] Stack trace: ${error.stack}`)
        requestShutdown('exception', error.message)
    })

    process.on('unhandledRejection', (reason, promise) => {
        logger.debug('[RUNNER RUN] FATAL: Unhandled promise rejection', reason)
        logger.debug('[RUNNER RUN] Rejected promise:', promise)
        const error = reason instanceof Error ? reason : new Error(`Unhandled promise rejection: ${reason}`)
        logger.debug(`[RUNNER RUN] Stack trace: ${error.stack}`)
        requestShutdown('exception', error.message)
    })

    process.on('exit', (code) => {
        logger.debug(`[RUNNER RUN] Process exiting with code: ${code}`)
    })

    process.on('beforeExit', (code) => {
        logger.debug(`[RUNNER RUN] Process about to exit with code: ${code}`)
    })

    return {
        requestShutdown,
        waitForShutdownRequest: async () => await shutdownRequested,
    }
}
