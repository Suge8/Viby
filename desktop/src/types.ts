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
    message?: string
}

export interface PairingParticipantSnapshot {
    tokenHint?: string
    label?: string
    publicKey?: string
    connectedAt?: number
    lastSeenAt?: number
}

export interface PairingSessionSnapshot {
    id: string
    state: string
    createdAt: number
    updatedAt: number
    expiresAt: number
    ticketExpiresAt: number
    shortCode: string | null
    approvalStatus: 'pending' | 'approved' | null
    host: PairingParticipantSnapshot
    guest?: PairingParticipantSnapshot | null
}

export interface PairingIceServer {
    urls: string | string[]
    username?: string
    credential?: string
    credentialType?: string
}

export interface DesktopPairingSession {
    pairing: PairingSessionSnapshot
    hostToken: string
    pairingUrl: string
    wsUrl: string
    iceServers: PairingIceServer[]
}

export interface PairingBridgeStats {
    transport: 'direct' | 'relay' | 'unknown'
    localCandidateType: string | null
    remoteCandidateType: string | null
    currentRoundTripTimeMs: number | null
    restartCount: number
}

export interface PairingBridgeState {
    phase: 'idle' | 'connecting' | 'ready' | 'error'
    message: string | null
    pairing: PairingSessionSnapshot | null
    stats?: PairingBridgeStats | null
}

export interface HubSnapshot {
    running: boolean
    managed: boolean
    logPath: string
    lastError?: string
    startupConfig: HubStartupConfig
    status?: HubRuntimeStatus
}
