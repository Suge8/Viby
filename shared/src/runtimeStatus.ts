export const HUB_RUNTIME_STATUS_FILE = 'hub.runtime-status.json'

export type HubRuntimePhase = 'starting' | 'ready' | 'stopped' | 'error'
export type HubLaunchSource = 'desktop' | 'cli'

export interface HubRuntimeStatus {
    phase: HubRuntimePhase
    pid: number
    launchSource?: HubLaunchSource
    listenHost: string
    listenPort: number
    localHubUrl: string
    preferredBrowserUrl: string
    publicUrl: string
    publicAccessEnabled: boolean
    /** True when this Hub watches settings.toml and hot-reloads the public access policy. Absent on older Hub builds. */
    publicAccessHotReload?: boolean
    pairingBrokerUrl?: string | null
    hubOwnerToken: string
    settingsFile: string
    dataDir: string
    startedAt: string
    updatedAt: string
    message?: string
}
