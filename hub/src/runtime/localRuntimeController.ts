import type { HubRuntimeStatusWriter } from '../runtimeStatus'
import type { HubRuntimeCore } from './core'
import type { DirectRuntimeRegistry } from './directRuntimeRegistry'
import type { LocalRuntimeController } from './runtimeHost'

export type LocalRuntimeControllerFactory = (options: {
    dataDir: string
    hubOwnerToken: string
    localHubUrl: string
    preferredBrowserUrl: string
    writeRuntimeStatus: HubRuntimeStatusWriter['write']
    buildReadyStatusMessage: (overrides?: ReadonlyArray<string | null>) => string
    buildStartingStatusMessage: (message: string) => string
    directRuntimeRegistry: DirectRuntimeRegistry
    requestShutdown: () => void
}) => LocalRuntimeController

export type HubProcessControllerOptions = {
    createLocalRuntimeController?: LocalRuntimeControllerFactory
}

export function createUnavailableLocalRuntimeController(): LocalRuntimeController {
    return {
        reload(_runtimeCore: HubRuntimeCore | null): void {},
        async start(): Promise<void> {
            throw new Error('Desktop AppCore runtime controller is not installed.')
        },
        async stop(): Promise<string | null> {
            return null
        },
    }
}
