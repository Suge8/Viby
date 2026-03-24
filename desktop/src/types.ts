export type HubRuntimePhase = 'starting' | 'ready' | 'stopped' | 'error'
export type HubLaunchSource = 'desktop' | 'cli'
export type DesktopEntryMode = 'local' | 'lan'

export interface HubStartupConfig {
    listenHost: string
    listenPort: number
}

export interface HubRuntimeStatus {
    phase: HubRuntimePhase
    pid: number
    launchSource?: HubLaunchSource
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

export interface HubSnapshot {
    running: boolean
    managed: boolean
    logPath: string
    lastError?: string
    startupConfig: HubStartupConfig
    status?: HubRuntimeStatus
}
