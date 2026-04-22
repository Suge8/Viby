import {
    type PairingRole,
    type PairingSessionRecord,
    type PairingSignal,
    toPairingSessionSnapshot,
} from '@viby/protocol/pairing'
import { isApprovedSession } from './storeSupport'
import type { ConnectionState, PairingConnection, PairingSocketLike } from './wsTypes'

const READY_STATE_OPEN = 1
const PENDING_SIGNAL_LIMIT = 64

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
        pending: new Map<PairingRole, PairingSignal[]>([
            ['host', []],
            ['guest', []],
        ]),
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

export function queuePendingSignal(state: ConnectionState, role: PairingRole, signal: PairingSignal): void {
    const queue = state.pending.get(role)
    if (!queue) {
        return
    }

    queue.push(signal)
    if (queue.length > PENDING_SIGNAL_LIMIT) {
        queue.shift()
    }
}

export function flushPendingSignals(state: ConnectionState, role: PairingRole): void {
    const socket = state.sockets.get(role)
    if (!socket || socket.readyState !== READY_STATE_OPEN) {
        return
    }

    const queue = state.pending.get(role)
    if (!queue || queue.length === 0) {
        return
    }

    while (queue.length > 0) {
        const signal = queue.shift()
        if (signal) {
            sendSignal(socket, signal)
        }
    }
}

export function emitReady(state: ConnectionState, pairingId: string, at: number, session: PairingSessionRecord): void {
    if (!isApprovedSession(session)) {
        return
    }

    const pairing = toPairingSessionSnapshot(session)
    for (const [role, socket] of state.sockets) {
        sendSignal(socket, {
            pairingId,
            type: 'ready',
            to: role,
            at,
            payload: { pairing },
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
            pairing: toPairingSessionSnapshot(session),
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
            pairing: toPairingSessionSnapshot(session),
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
        payload: { pairing: toPairingSessionSnapshot(session) },
    })
}

export function emitExpired(
    state: ConnectionState,
    pairingId: string,
    at: number,
    session: PairingSessionRecord,
    reason: 'deleted' | 'expired'
): void {
    const pairing = toPairingSessionSnapshot(session)
    for (const [role, socket] of state.sockets) {
        sendSignal(socket, {
            pairingId,
            type: 'expire',
            to: role,
            at,
            reason,
            payload: { pairing },
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
