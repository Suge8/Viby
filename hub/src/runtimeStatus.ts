import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
    HUB_RUNTIME_STATUS_FILE,
    type HubLaunchSource,
    type HubRuntimePhase,
    type HubRuntimeStatus,
} from '@viby/protocol/runtimeStatus'

interface HubRuntimeStatusWriterOptions {
    dataDir: string
    listenHost: string
    listenPort: number
    localHubUrl: string
    publicUrl: string
    publicAccessEnabled: boolean
    pairingBrokerUrl: string | null
    hubOwnerToken: string
    settingsFile: string
    launchSource?: HubLaunchSource
}

export interface HubRuntimeStatusUpdate {
    phase: HubRuntimePhase
    preferredBrowserUrl?: string
    message?: string
}

export interface HubRuntimeStatusWriter {
    filePath: string
    write(update: HubRuntimeStatusUpdate): Promise<HubRuntimeStatus>
    /** Hot-reload the public access policy into the status file without a phase change. */
    updatePublicAccessEnabled(enabled: boolean): Promise<HubRuntimeStatus>
}

function createBaseStatus(options: HubRuntimeStatusWriterOptions): HubRuntimeStatus {
    const now = new Date().toISOString()
    return {
        phase: 'starting',
        pid: process.pid,
        launchSource: options.launchSource,
        listenHost: options.listenHost,
        listenPort: options.listenPort,
        localHubUrl: options.localHubUrl,
        preferredBrowserUrl: options.localHubUrl,
        publicUrl: options.publicUrl,
        publicAccessEnabled: options.publicAccessEnabled,
        // This Hub build watches settings.toml and hot-reloads the policy without a restart.
        publicAccessHotReload: true,
        pairingBrokerUrl: options.pairingBrokerUrl,
        hubOwnerToken: options.hubOwnerToken,
        settingsFile: options.settingsFile,
        dataDir: options.dataDir,
        startedAt: now,
        updatedAt: now,
    }
}

async function writeStatusFile(filePath: string, status: HubRuntimeStatus): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true })
    const tmpPath = `${filePath}.tmp`
    await writeFile(tmpPath, JSON.stringify(status, null, 2), 'utf-8')
    await rename(tmpPath, filePath)
}

export function getHubRuntimeStatusFile(dataDir: string): string {
    return join(dataDir, HUB_RUNTIME_STATUS_FILE)
}

export function createHubRuntimeStatusWriter(options: HubRuntimeStatusWriterOptions): HubRuntimeStatusWriter {
    const filePath = getHubRuntimeStatusFile(options.dataDir)
    let currentStatus = createBaseStatus(options)

    return {
        filePath,
        async write(update: HubRuntimeStatusUpdate): Promise<HubRuntimeStatus> {
            currentStatus = {
                ...currentStatus,
                phase: update.phase,
                preferredBrowserUrl: update.preferredBrowserUrl ?? currentStatus.preferredBrowserUrl,
                message: update.message,
                updatedAt: new Date().toISOString(),
            }

            await writeStatusFile(filePath, currentStatus)
            return currentStatus
        },
        async updatePublicAccessEnabled(enabled: boolean): Promise<HubRuntimeStatus> {
            currentStatus = {
                ...currentStatus,
                publicAccessEnabled: enabled,
                updatedAt: new Date().toISOString(),
            }

            await writeStatusFile(filePath, currentStatus)
            return currentStatus
        },
    }
}
