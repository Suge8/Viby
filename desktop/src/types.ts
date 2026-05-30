import type { PairingTunnelDirectBlockedReason, PairingTunnelTransport } from '@viby/protocol/pairing'

export type HubRuntimePhase = 'starting' | 'ready' | 'stopped' | 'error'
export type HubLaunchSource = 'desktop' | 'cli'

export interface HubStartupConfig {
    listenHost: string
    listenPort: number
    publicAccessEnabled: boolean
}

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
    publicAccessHotReload?: boolean
    pairingBrokerUrl?: string | null
    hubOwnerToken: string
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
    metadata?: Record<string, unknown>
}

export interface PairingRemoteConnectionSnapshot {
    id: string
    label?: string
    publicKey?: string
    connectedAt?: number
    createdAt: number
    lastSeenAt: number
    metadata?: Record<string, unknown>
}

export interface PairingSessionSnapshot {
    id: string
    state: string
    createdAt: number
    updatedAt: number
    expiresAt: number

    shortCode: string | null
    approvalStatus: 'approved' | null
    host: PairingParticipantSnapshot
    guest?: PairingParticipantSnapshot | null
}

export type DesktopPairingSnapshot = PairingSessionSnapshot & {
    remoteConnections: PairingRemoteConnectionSnapshot[]
}

export interface PairingIceServer {
    urls: string | string[]
    username?: string
    credential?: string
    credentialType?: string
}

export interface DesktopPairingSession {
    pairing: DesktopPairingSnapshot
    hostToken: string
    pairingUrl: string
    wsUrl: string
    tunnelUrl: string
    eventsUrl?: string
    iceServers: PairingIceServer[]
}

/**
 * LAN pairing invite. Phones connect directly to the hub after verify, so
 * the desktop only tracks the invite link plus the SSE events URL; there is
 * no broker host token, WS tunnel, or ICE list to advertise.
 */
export interface DesktopLanPairingSession {
    pairing: PairingSessionSnapshot
    pairingUrl: string
    eventsUrl: string
}

export interface PairingBridgeStats {
    transport: 'direct' | 'relay' | 'unknown'
    transportMode: PairingTunnelTransport | 'unknown'
    /**
     * Last confirmed transport (only ever `direct` or `relay`). Used by the
     * UI to render in-flight transition messages such as "由中转切换至点对点”
     * when `transport=unknown` mid-renegotiation, and to highlight a relay
     * <-> direct upgrade / downgrade once it lands.
     */
    previousTransport?: 'direct' | 'relay' | null
    localCandidateType: string | null
    remoteCandidateType: string | null
    currentRoundTripTimeMs: number | null
    sampledAt: number
    staleAfterMs: number
    routeRevision: number
    directBlockedReason?: PairingTunnelDirectBlockedReason | null
    restartCount: number
}

export interface PairingBridgeState {
    phase: 'connecting' | 'ready' | 'fatal'
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
