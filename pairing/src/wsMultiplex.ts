import type { PairingRole } from '@viby/protocol/pairing'
import { type PairingPendingSocketMessages, sendOrBufferSocketMessage } from './wsPendingMessages'
import { oppositeRole } from './wsSupport'
import type { ConnectionState, PairingConnection, PairingSocketHubOptions, PairingSocketLike } from './wsTypes'

const CONNECTION_ID_FIELD = 'connectionId'

function tagConnection(rawText: string, connectionId: string): string {
    const frame = JSON.parse(rawText) as Record<string, unknown>
    frame[CONNECTION_ID_FIELD] = connectionId
    return JSON.stringify(frame)
}

function readConnectionId(rawText: string): string | null {
    const value = (JSON.parse(rawText) as Record<string, unknown>)[CONNECTION_ID_FIELD]
    return typeof value === 'string' && value.length > 0 ? value : null
}

export function forwardPairingSocketMessage(options: {
    hubOptions: PairingSocketHubOptions
    connection: PairingConnection
    pendingMessages: PairingPendingSocketMessages
    rawText: string
    state: ConnectionState | undefined
}): void {
    const { connection, hubOptions, pendingMessages, rawText, state } = options
    if (hubOptions.multiplexGuests)
        return forwardMultiplexedMessage({ connection, hubOptions, pendingMessages, rawText, state })
    const targetRole = oppositeRole(connection.role)
    sendOrBufferSocketMessage({
        bufferMessages: hubOptions.bufferMessages,
        connection,
        pendingMessages,
        rawText,
        shouldBufferMessage: hubOptions.shouldBufferMessage,
        target: state?.sockets.get(targetRole),
        targetRole,
    })
}

function forwardMultiplexedMessage(options: {
    connection: PairingConnection
    hubOptions: PairingSocketHubOptions
    pendingMessages: PairingPendingSocketMessages
    rawText: string
    state: ConnectionState | undefined
}) {
    const { connection, hubOptions, pendingMessages, rawText, state } = options
    if (!state) return
    if (connection.role === 'guest') {
        sendOrBufferSocketMessage({
            bufferMessages: hubOptions.bufferMessages,
            connection,
            pendingMessages,
            rawText: tagConnection(rawText, connection.connectionId),
            shouldBufferMessage: hubOptions.shouldBufferMessage,
            target: state.sockets.get('host'),
            targetRole: 'host',
        })
        return
    }
    const targetConnectionId = readConnectionId(rawText)
    if (targetConnectionId) return state.guestSockets.get(targetConnectionId)?.send(rawText)
    if (state.guestSockets.size === 0) {
        sendOrBufferSocketMessage({
            bufferMessages: hubOptions.bufferMessages,
            connection,
            pendingMessages,
            rawText,
            shouldBufferMessage: hubOptions.shouldBufferMessage,
            target: undefined,
            targetRole: 'guest',
        })
        return
    }
    for (const socket of state.guestSockets.values()) socket.send(rawText)
}

export function getPairingSocket(options: {
    multiplexGuests?: boolean
    role: PairingRole
    state: ConnectionState
    tokenHash: string
}): PairingSocketLike | undefined {
    return options.multiplexGuests && options.role === 'guest'
        ? options.state.guestSockets.get(options.tokenHash)
        : options.state.sockets.get(options.role)
}

export function setPairingSocket(options: {
    multiplexGuests?: boolean
    role: PairingRole
    socket: PairingSocketLike
    state: ConnectionState
    tokenHash: string
}): void {
    options.state.sockets.set(options.role, options.socket)
    if (options.multiplexGuests && options.role === 'guest')
        options.state.guestSockets.set(options.tokenHash, options.socket)
}

export function deletePairingSocket(
    state: ConnectionState,
    connection: PairingConnection,
    multiplexGuests?: boolean
): void {
    if (multiplexGuests && connection.role === 'guest') state.guestSockets.delete(connection.connectionId)
    if (state.sockets.get(connection.role) === connection.socket) state.sockets.delete(connection.role)
}

export function getPairingRoleSockets(
    state: ConnectionState,
    role: PairingRole,
    multiplexGuests?: boolean
): PairingSocketLike[] {
    if (multiplexGuests && role === 'guest') return [...state.guestSockets.values()]
    const socket = state.sockets.get(role)
    return socket ? [socket] : []
}

export function getAllPairingSockets(state: ConnectionState): PairingSocketLike[] {
    return [...new Set([...state.sockets.values(), ...state.guestSockets.values()])]
}
