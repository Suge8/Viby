export const HUB_RUNTIME_STATUS_FILE = 'hub.runtime-status.json'

export type HubRuntimePhase = 'starting' | 'ready' | 'stopped' | 'error'
export type HubLaunchSource = 'desktop' | 'cli'

export interface HubRuntimeStatus {
    phase: HubRuntimePhase
    pid: number
    launchSource?: HubLaunchSource
    relayEnabled: boolean
    listenHost: string
    listenPort: number
    localHubUrl: string
    preferredBrowserUrl: string
    cliApiToken: string
    settingsFile: string
    dataDir: string
    startedAt: string
    updatedAt: string
    publicHubUrl?: string
    directAccessUrl?: string
    message?: string
}
