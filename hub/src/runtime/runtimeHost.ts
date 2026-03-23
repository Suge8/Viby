import type { Server as BunServer } from 'bun'
import type { WebSocketData } from '@socket.io/bun-engine'

import { buildConnectingMessage } from '../hubHelpers'
import type { HubRuntimeStatusUpdate, HubRuntimeStatusWriter } from '../runtimeStatus'
import { TunnelManager } from '../tunnel'
import { announceTunnelAccess } from '../tunnel/announceTunnelAccess'
import type { HubRuntimeAccessor } from './accessor'
import type { HubRuntimeCore } from './core'
import type { ManagedRunnerController } from './managedRunner'

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

type CreateHubRuntimeHostOptions = {
    runtimeAccessor: HubRuntimeAccessor
    createRuntimeCore: () => HubRuntimeCore
    createWebFetch: () => Promise<RuntimeWebFetch>
    webServer: BunServer<WebSocketData>
    runtimeStatus: HubRuntimeStatusWriter
    managedRunner: ManagedRunnerController
    localHubUrl: string
    runtimeListenPort: number
    cliApiToken: string
    relayEnabled: boolean
    relayApiDomain: string
    officialWebUrl: string
    portFallbackMessage: string | null
}

function buildStartingStatusMessage(portFallbackMessage: string | null, message: string): string {
    return [message, portFallbackMessage].filter(Boolean).join(' ')
}

export function createHubRuntimeHost(options: CreateHubRuntimeHostOptions): HubRuntimeHost {
    let tunnelManager: TunnelManager | null = null

    async function writeRuntimeStatus(update: HubRuntimeStatusUpdate): Promise<void> {
        await options.runtimeStatus.write(update)
    }

    async function startRelayTunnel(): Promise<void> {
        if (!options.relayEnabled || tunnelManager) {
            return
        }

        tunnelManager = new TunnelManager({
            localPort: options.runtimeListenPort,
            enabled: true,
            apiDomain: options.relayApiDomain,
            authKey: process.env.VIBY_RELAY_AUTH || null,
            useRelay: process.env.VIBY_RELAY_FORCE_TCP === 'true' || process.env.VIBY_RELAY_FORCE_TCP === '1'
        })

        try {
            const tunnelUrl = await tunnelManager.start()
            if (!tunnelUrl) {
                return
            }

            await announceTunnelAccess({
                tunnelUrl,
                manager: tunnelManager,
                officialWebUrl: options.officialWebUrl,
                cliApiToken: options.cliApiToken,
                localHubUrl: options.localHubUrl,
                writeRuntimeStatus
            })
        } catch (error) {
            console.error('[Tunnel] Failed to start:', error instanceof Error ? error.message : error)
            console.log('[Tunnel] Hub continuing without tunnel. Restart without --relay to disable.')
            await writeRuntimeStatus({
                phase: 'ready',
                preferredBrowserUrl: options.localHubUrl,
                message: '公网入口暂时不可用，已保留本地入口。'
            })
        }
    }

    async function reloadRuntime(): Promise<void> {
        const nextRuntime = options.createRuntimeCore()
        const nextFetch = await options.createWebFetch()

        options.runtimeAccessor.replaceRuntime(nextRuntime)
        options.webServer.reload({ fetch: nextFetch })
        options.managedRunner.onRuntimeReload()
    }

    async function start(): Promise<void> {
        await reloadRuntime()

        await writeRuntimeStatus({
            phase: 'starting',
            preferredBrowserUrl: options.localHubUrl,
            message: buildStartingStatusMessage(
                options.portFallbackMessage,
                buildConnectingMessage(options.relayEnabled)
            )
        })

        await options.managedRunner.startStartupRecovery()
        await startRelayTunnel()
    }

    async function shutdown(
        shutdownOptions: RuntimeShutdownOptions = {}
    ): Promise<number> {
        console.log(shutdownOptions.logMessage ?? '\nShutting down...')

        await writeRuntimeStatus({
            phase: shutdownOptions.statusPhase ?? 'stopped',
            preferredBrowserUrl: options.localHubUrl,
            message: shutdownOptions.statusMessage ?? 'Hub stopped.'
        })

        const runnerStopError = await options.managedRunner.stop()

        await tunnelManager?.stop()
        tunnelManager = null

        options.runtimeAccessor.disposeRuntime()
        options.webServer.stop()

        if (runnerStopError) {
            return 1
        }

        return shutdownOptions.exitCode ?? 0
    }

    return {
        reloadRuntime,
        start,
        shutdown
    }
}
