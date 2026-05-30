import type { PairingRole } from '@viby/protocol/pairing'
import type { PairingMetrics } from './metrics'
import type { PairingStore } from './store'
export interface PairingSocketLike {
    readonly readyState: number
    data?: unknown
    send(data: string): void
    close(code?: number, reason?: string): void
}
export interface PairingConnection {
    connectionId: string
    connectionKey: string
    pairingId: string
    role: PairingRole
    socket: PairingSocketLike
    tokenHash: string
}
export interface PairingSocketHubOptions {
    store: PairingStore
    now?: () => number
    bufferMessages?: boolean
    disconnectGraceMs?: number
    logger?: Pick<Console, 'debug' | 'error' | 'log' | 'warn'>
    maxBufferedMessagesPerRole?: number
    messageSchema?: { parse(value: unknown): unknown }
    shouldBufferMessage?: (rawText: string) => boolean
    metrics?: PairingMetrics
    multiplexGuests?: boolean
    trackRemoteConnectionLiveness?: boolean
    onRemoteConnectionsChanged?: (pairingId: string) => Promise<void> | void
}
export interface PairingSocketHubSnapshot {
    activeSessions: number
    activeSockets: number
    pairedSessions: number
    activeRemoteConnections: number
    disconnectGraceByRole: Record<PairingRole, number>
    disconnectGraceTimers: number
    maxRemoteConnectionsPerPairing: number
    pairingsWithRemoteConnections: number
}
export interface ConnectionState {
    sockets: Map<PairingRole, PairingSocketLike>
    guestSockets: Map<string, PairingSocketLike>
    disconnectTimerRoles: Map<string, PairingRole>
    disconnectTimers: Map<string, ReturnType<typeof setTimeout>>
}
