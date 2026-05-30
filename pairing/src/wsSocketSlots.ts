import { buildPairingConnectionKey } from './wsConnectionIndex'
import { deletePairingSocket, getPairingSocket, setPairingSocket } from './wsMultiplex'
import type { ConnectionState, PairingConnection, PairingSocketHubOptions, PairingSocketLike } from './wsTypes'

export function attachPairingSocket(options: {
    identity: { connectionId?: string; role: PairingConnection['role'] }
    pairingId: string
    socket: PairingSocketLike
    state: ConnectionState
    tokenHash: string
    hubOptions: PairingSocketHubOptions
    deleteIndexedSocket: (socket: PairingSocketLike) => void
}): PairingConnection {
    const connectionId = options.identity.connectionId ?? options.tokenHash
    const existing = getPairingSocket({
        state: options.state,
        role: options.identity.role,
        tokenHash: connectionId,
        multiplexGuests: options.hubOptions.multiplexGuests,
    })
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
    setPairingSocket({
        state: options.state,
        role: options.identity.role,
        tokenHash: connectionId,
        socket: options.socket,
        multiplexGuests: options.hubOptions.multiplexGuests,
    })
    return connection
}

export function detachPairingSocket(options: {
    connection: PairingConnection
    hubOptions: PairingSocketHubOptions
    state: ConnectionState | undefined
}): ConnectionState | null {
    const { connection, hubOptions, state } = options
    if (
        !state ||
        getPairingSocket({
            state,
            role: connection.role,
            tokenHash: connection.connectionId,
            multiplexGuests: hubOptions.multiplexGuests,
        }) !== connection.socket
    ) {
        return null
    }
    deletePairingSocket(state, connection, hubOptions.multiplexGuests)
    return state
}
