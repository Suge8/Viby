import { createHubProcessController, type HubProcessController } from './runtime/processController'

type DevHotGlobal = typeof globalThis & {
    __vibyHubDevHotController?: HubProcessController
    __vibyHubDevHotSignalsInstalled?: boolean
}

function getDevHotGlobal(): DevHotGlobal {
    return globalThis as DevHotGlobal
}

async function shutdownAndExit(controller: HubProcessController): Promise<void> {
    const exitCode = await controller.shutdown()
    process.exit(exitCode)
}

function installSignalHandlers(controller: HubProcessController): void {
    const hotGlobal = getDevHotGlobal()
    if (hotGlobal.__vibyHubDevHotSignalsInstalled) {
        return
    }

    hotGlobal.__vibyHubDevHotSignalsInstalled = true
    process.on('SIGINT', () => {
        void shutdownAndExit(controller)
    })
    process.on('SIGTERM', () => {
        void shutdownAndExit(controller)
    })
}

async function main(): Promise<void> {
    const hotGlobal = getDevHotGlobal()
    const existingController = hotGlobal.__vibyHubDevHotController
    if (existingController) {
        await existingController.reloadRuntime()
        console.log('[dev-hot] hub runtime reloaded in-place')
        return
    }

    const controller = createHubProcessController()
    hotGlobal.__vibyHubDevHotController = controller
    installSignalHandlers(controller)
    await controller.start()
    console.log('[dev-hot] hub runtime ready for in-place reloads')
}

void main().catch(async (error) => {
    console.error('[dev-hot] fatal error:', error)

    const controller = getDevHotGlobal().__vibyHubDevHotController
    if (!controller) {
        process.exit(1)
    }

    const exitCode = await controller.shutdown({
        exitCode: 1,
        logMessage: '[dev-hot] shutting down after fatal error...',
        statusMessage: error instanceof Error ? error.message : String(error),
        statusPhase: 'error'
    })
    process.exit(exitCode)
})
