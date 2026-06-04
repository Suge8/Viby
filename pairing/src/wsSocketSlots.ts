import { buildPairingConnectionKey } from './wsConnectionIndex'
import { deletePairingSocket, getPairingSocket, setPairingSocket } from './wsMultiplex'
import type { ConnectionState, PairingConnection, PairingSocketLike } from './wsTypes'

export function attachPairingSocket(options: {
    identity: { connectionId?: string; role: PairingConnection['role'] }
    pairingId: string
    socket: PairingSocketLike
    state: ConnectionState
    tokenHash: string
    deleteIndexedSocket: (socket: PairingSocketLike) => void
}): PairingConnection {
    const connectionId = options.identity.connectionId ?? options.tokenHash
    const existing = getPairingSocket(options.state, options.identity.role)
    if (existing && existing !== options.socket) {
        options.deleteIndexedSocket(existing)
        existing.close(1012, 'replaced')
    }
    const connection = {
        connectionId,
        connectionKey: buildPairingConnectionKey(options.pairingId, options.identity.role, connectionId),
        pairingId: options.pairingId,
        role: options.identity.role,
        tokenHash: options.tokenHash,
        socket: options.socket,
    }
    setPairingSocket(options.state, connection)
    return connection
}

export function detachPairingSocket(options: {
    connection: PairingConnection
    state: ConnectionState | undefined
}): ConnectionState | null {
    const { connection, state } = options
    if (!state || getPairingSocket(state, connection.role) !== connection.socket) return null
    deletePairingSocket(state, connection)
    return state
}
