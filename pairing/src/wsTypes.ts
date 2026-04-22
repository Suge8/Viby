import type { PairingRole, PairingSignal } from '@viby/protocol/pairing'
import type { PairingStore } from './store'

export interface PairingSocketLike {
    readonly readyState: number
    send(data: string): void
    close(code?: number, reason?: string): void
}

export interface PairingConnection {
    pairingId: string
    role: PairingRole
    tokenHash: string
    socket: PairingSocketLike
}

export interface PairingSocketHubOptions {
    store: PairingStore
    now?: () => number
    logger?: Pick<Console, 'debug' | 'error' | 'log' | 'warn'>
}

export interface ConnectionState {
    sockets: Map<PairingRole, PairingSocketLike>
    pending: Map<PairingRole, PairingSignal[]>
}
