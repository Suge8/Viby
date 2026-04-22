import type { ApiSessionClient } from '@/api/apiSession'
import { logger } from '@/ui/logger'
import { restoreTerminalState } from '@/ui/terminalState'

type RunnerLifecycleOptions = {
    session: ApiSessionClient
    logTag: string
    stopKeepAlive?: () => void
    requestShutdown?: () => Promise<void> | void
    onBeforeClose?: () => Promise<void> | void
    onAfterClose?: () => Promise<void> | void
}

export type RunnerLifecycle = {
    setExitCode: (code: number) => void
    markCrash: (error: unknown) => void
    cleanup: () => Promise<void>
    cleanupAndExit: (codeOverride?: number) => Promise<void>
    registerProcessHandlers: () => void
}

export type RuntimeStopRequestOwner = {
    requestRuntimeStop: () => Promise<boolean>
}

type RuntimeStopRequestHandlerOptions = {
    getOwner: () => RuntimeStopRequestOwner | null | undefined
    cleanupAndExit: () => Promise<void>
}

export function createRunnerLifecycle(options: RunnerLifecycleOptions): RunnerLifecycle {
    let exitCode = 0
    let cleanupPromise: Promise<void> | null = null

    const logPrefix = `[${options.logTag}]`

    const closeSession = async () => {
        options.session.sendSessionDeath()
        await options.session.flush()
        await options.session.close()
    }

    const cleanup = async () => {
        if (cleanupPromise) {
            return cleanupPromise
        }

        cleanupPromise = (async () => {
            logger.debug(`${logPrefix} Cleanup start`)
            restoreTerminalState()

            try {
                options.stopKeepAlive?.()
                await options.onBeforeClose?.()
                await closeSession()
                logger.debug(`${logPrefix} Cleanup complete`)
            } finally {
                try {
                    await options.onAfterClose?.()
                } catch (error) {
                    logger.debug(`${logPrefix} Error during post-cleanup:`, error)
                }
            }
        })()

        return cleanupPromise
    }

    const cleanupAndExit = async (codeOverride?: number) => {
        if (codeOverride !== undefined) {
            exitCode = codeOverride
        }

        try {
            await cleanup()
            process.exit(exitCode)
        } catch (error) {
            logger.debug(`${logPrefix} Error during cleanup:`, error)
            process.exit(1)
        }
    }

    const setExitCode = (code: number) => {
        exitCode = code
    }

    const markCrash = (error: unknown) => {
        logger.debug(`${logPrefix} Unhandled error:`, error)
        exitCode = 1
    }

    const registerProcessHandlers = () => {
        const handleSignal = async () => {
            if (options.requestShutdown) {
                try {
                    await options.requestShutdown()
                    return
                } catch (error) {
                    logger.debug(`${logPrefix} Error during graceful shutdown request:`, error)
                    await cleanupAndExit(1)
                    return
                }
            }

            await cleanupAndExit()
        }

        process.on('SIGTERM', () => {
            void handleSignal()
        })

        process.on('SIGINT', () => {
            void handleSignal()
        })

        process.on('uncaughtException', (error) => {
            markCrash(error)
            void cleanupAndExit(1)
        })

        process.on('unhandledRejection', (reason) => {
            markCrash(reason)
            void cleanupAndExit(1)
        })
    }

    return {
        setExitCode,
        markCrash,
        cleanup,
        cleanupAndExit,
        registerProcessHandlers,
    }
}

export function setControlledByUser(session: ApiSessionClient, controlledByUser: boolean): void {
    session.updateAgentState((currentState) => ({
        ...currentState,
        controlledByUser,
    }))
}

export function createRuntimeStopRequestHandler(options: RuntimeStopRequestHandlerOptions): () => Promise<void> {
    return async () => {
        try {
            const runtimeStopRequested = await options.getOwner()?.requestRuntimeStop()
            if (runtimeStopRequested) {
                return
            }
        } catch (error) {
            logger.debug('[runner-lifecycle] Runtime stop owner failed; falling back to lifecycle cleanup', error)
        }

        await options.cleanupAndExit()
    }
}
