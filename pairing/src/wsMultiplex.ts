import { type PairingPendingSocketMessages, sendOrBufferSocketMessage } from './wsPendingMessages'
import { oppositeRole } from './wsSupport'
import type { ConnectionState, PairingConnection, PairingSocketLike } from './wsTypes'

export function forwardPairingSocketMessage(options: {
    bufferMessages?: boolean
    connection: PairingConnection
    pendingMessages: PairingPendingSocketMessages
    rawText: string
    shouldBufferMessage?: (rawText: string) => boolean
    state: ConnectionState | undefined
}): void {
    const targetRole = oppositeRole(options.connection.role)
    sendOrBufferSocketMessage({
        bufferMessages: options.bufferMessages,
        connection: options.connection,
        pendingMessages: options.pendingMessages,
        rawText: options.rawText,
        shouldBufferMessage: options.shouldBufferMessage,
        target: options.state?.sockets.get(targetRole),
        targetRole,
    })
}

export function getPairingSocket(
    state: ConnectionState,
    role: PairingConnection['role']
): PairingSocketLike | undefined {
    return state.sockets.get(role)
}

export function setPairingSocket(state: ConnectionState, connection: PairingConnection): void {
    state.sockets.set(connection.role, connection.socket)
}

export function deletePairingSocket(state: ConnectionState, connection: PairingConnection): void {
    if (state.sockets.get(connection.role) === connection.socket) state.sockets.delete(connection.role)
}

export function getAllPairingSockets(state: ConnectionState): PairingSocketLike[] {
    return [...state.sockets.values()]
}
