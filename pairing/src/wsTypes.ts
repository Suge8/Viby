import type { PairingRole } from '@viby/protocol/pairing'
import type { PairingStore } from './store'

export interface PairingSocketLike {
    readonly readyState: number
    data?: unknown
    send(data: string): void
    close(code?: number, reason?: string): void
}

export interface PairingConnection {
    connectionKey: string
    pairingId: string
    role: PairingRole
    tokenHash: string
    socket: PairingSocketLike
}

export interface PairingSocketHubOptions {
    store: PairingStore
    now?: () => number
    disconnectGraceMs?: number
    logger?: Pick<Console, 'debug' | 'error' | 'log' | 'warn'>
}

export interface PairingSocketHubSnapshot {
    activeSessions: number
    activeSockets: number
    pairedSessions: number
    disconnectGraceTimers: number
}

export interface ConnectionState {
    sockets: Map<PairingRole, PairingSocketLike>
    disconnectTimers: Map<PairingRole, ReturnType<typeof setTimeout>>
}
