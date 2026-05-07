import {
    type PairingRole,
    type PairingSessionRecord,
    type PairingSignal,
    toPairingSessionSnapshotForRole,
} from '@viby/protocol/pairing'
import { isApprovedSession } from './storeSupport'
import type { ConnectionState, PairingConnection, PairingSocketLike } from './wsTypes'

const READY_STATE_OPEN = 1

type ReadySource = {
    role?: PairingRole
    transportId?: string | null
}

export const CLIENT_MESSAGE_TYPES = new Set(['join', 'offer', 'answer', 'candidate', 'ping'])

export function sendSignal(socket: PairingSocketLike, signal: PairingSignal): void {
    if (socket.readyState !== READY_STATE_OPEN) {
        return
    }

    socket.send(JSON.stringify(signal))
}

export function createEmptyState(): ConnectionState {
    return {
        sockets: new Map<PairingRole, PairingSocketLike>(),
        disconnectTimers: new Map<PairingRole, ReturnType<typeof setTimeout>>(),
    }
}

export function oppositeRole(role: PairingRole): PairingRole {
    return role === 'host' ? 'guest' : 'host'
}

export function normalizeSignal(
    signal: PairingSignal,
    pairingId: string,
    role: PairingRole,
    at: number,
    payload?: unknown
): PairingSignal {
    return {
        ...signal,
        id: signal.id ?? `${pairingId}:${role}:${at}`,
        pairingId,
        from: role,
        to: signal.to ?? oppositeRole(role),
        payload: payload ?? signal.payload,
        at,
    }
}

export function emitReady(
    state: ConnectionState,
    pairingId: string,
    at: number,
    session: PairingSessionRecord,
    source: ReadySource = {}
): void {
    if (!isApprovedSession(session)) {
        return
    }

    for (const [role, socket] of state.sockets) {
        sendSignal(socket, {
            pairingId,
            type: 'ready',
            from: source.role,
            to: role,
            at,
            payload: {
                pairing: toPairingSessionSnapshotForRole(session, role),
                transportId: source.transportId ?? undefined,
            },
        })
    }
}

export function emitState(connection: PairingConnection, at: number, session: PairingSessionRecord): void {
    sendSignal(connection.socket, {
        pairingId: connection.pairingId,
        type: 'state',
        to: connection.role,
        at,
        payload: {
            role: connection.role,
            pairing: toPairingSessionSnapshotForRole(session, connection.role),
        },
    })
}

export function emitStateToSocket(
    socket: PairingSocketLike,
    pairingId: string,
    role: PairingRole,
    at: number,
    session: PairingSessionRecord
): void {
    sendSignal(socket, {
        pairingId,
        type: 'state',
        to: role,
        at,
        payload: {
            role,
            pairing: toPairingSessionSnapshotForRole(session, role),
        },
    })
}

export function emitError(connection: PairingConnection, at: number, code: string, message: string): void {
    sendSignal(connection.socket, {
        pairingId: connection.pairingId,
        type: 'error',
        to: connection.role,
        at,
        reason: code,
        payload: { code, message },
    })
}

export function emitPeerLeft(
    socket: PairingSocketLike,
    pairingId: string,
    role: PairingRole,
    at: number,
    session: PairingSessionRecord
): void {
    sendSignal(socket, {
        pairingId,
        type: 'peer-left',
        to: role,
        at,
        payload: { pairing: toPairingSessionSnapshotForRole(session, role) },
    })
}

export function emitExpired(
    state: ConnectionState,
    pairingId: string,
    at: number,
    session: PairingSessionRecord,
    reason: 'deleted' | 'expired'
): void {
    for (const [role, socket] of state.sockets) {
        sendSignal(socket, {
            pairingId,
            type: 'expire',
            to: role,
            at,
            reason,
            payload: { pairing: toPairingSessionSnapshotForRole(session, role) },
        })
        socket.close(1000, reason)
    }
}

export function emitPong(
    socket: PairingSocketLike,
    pairingId: string,
    role: PairingRole,
    at: number,
    signal: PairingSignal
): void {
    sendSignal(socket, {
        id: signal.id,
        pairingId,
        type: 'pong',
        to: role,
        at,
        payload: signal.payload,
    })
}

export async function readRawText(rawData: string | ArrayBuffer | SharedArrayBuffer | Blob): Promise<string | null> {
    if (typeof rawData === 'string') {
        return rawData
    }

    if (rawData instanceof Blob) {
        return await rawData.text()
    }

    const bytes = rawData instanceof ArrayBuffer ? new Uint8Array(rawData) : new Uint8Array(rawData)
    return new TextDecoder().decode(bytes)
}
