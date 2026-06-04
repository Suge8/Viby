import type { WebSocketData } from '@socket.io/bun-engine'
import type { Server as BunServer } from 'bun'

import { buildConnectingMessage } from '../hubHelpers'
import type { HubRuntimeStatusUpdate, HubRuntimeStatusWriter } from '../runtimeStatus'
import type { HubRuntimeAccessor } from './accessor'
import type { HubRuntimeCore } from './core'

type RuntimeWebFetch = (req: Request, server: BunServer<WebSocketData>) => Response | Promise<Response>

export type RuntimeShutdownOptions = {
    exitCode?: number
    logMessage?: string
    statusMessage?: string
    statusPhase?: 'stopped' | 'error'
}

export type HubRuntimeHost = {
    reloadRuntime(): Promise<void>
    start(): Promise<void>
    shutdown(options?: RuntimeShutdownOptions): Promise<number>
}

export type LocalRuntimeController = {
    reload(runtimeCore: HubRuntimeCore | null): void
    start(): Promise<void>
    stop(): Promise<string | null>
}

type CreateHubRuntimeHostOptions = {
    runtimeAccessor: HubRuntimeAccessor
    createRuntimeCore: () => HubRuntimeCore
    createWebFetch: () => Promise<RuntimeWebFetch>
    webServer: BunServer<WebSocketData>
    runtimeStatus: HubRuntimeStatusWriter
    runtimeController: LocalRuntimeController
    preferredBrowserUrl: string
    portFallbackMessage: string | null
}

function buildStartingStatusMessage(portFallbackMessage: string | null, message: string): string {
    return [message, portFallbackMessage].filter(Boolean).join(' ')
}

export function createHubRuntimeHost(options: CreateHubRuntimeHostOptions): HubRuntimeHost {
    async function writeRuntimeStatus(update: HubRuntimeStatusUpdate): Promise<void> {
        await options.runtimeStatus.write(update)
    }

    async function reloadRuntime(): Promise<void> {
        const nextRuntime = options.createRuntimeCore()
        const nextFetch = await options.createWebFetch()

        options.runtimeAccessor.replaceRuntime(nextRuntime)
        options.webServer.reload({ fetch: nextFetch })
        options.runtimeController.reload(nextRuntime)
    }

    async function start(): Promise<void> {
        await reloadRuntime()

        await writeRuntimeStatus({
            phase: 'starting',
            preferredBrowserUrl: options.preferredBrowserUrl,
            message: buildStartingStatusMessage(options.portFallbackMessage, buildConnectingMessage()),
        })

        await options.runtimeController.start()
    }

    async function shutdown(shutdownOptions: RuntimeShutdownOptions = {}): Promise<number> {
        console.log(shutdownOptions.logMessage ?? '\nShutting down...')

        await writeRuntimeStatus({
            phase: shutdownOptions.statusPhase ?? 'stopped',
            preferredBrowserUrl: options.preferredBrowserUrl,
            message: shutdownOptions.statusMessage ?? 'Hub stopped.',
        })

        const runtimeStopError = await options.runtimeController.stop()

        options.runtimeAccessor.disposeRuntime()
        options.webServer.stop()

        if (runtimeStopError) {
            return 1
        }

        return shutdownOptions.exitCode ?? 0
    }

    return {
        reloadRuntime,
        start,
        shutdown,
    }
}
