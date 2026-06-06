import type { PairingRole, PairingSessionRecord } from '@viby/protocol/pairing'
import type { PairingRemoteConnectionDraft, PairingRemoteConnectionRecord } from './storeTypes'

export type PairingTokenIndexValue = {
    connectionId?: string
    pairingId: string
    role: PairingRole
}

export type PairingTokenIndexOp =
    | { type: 'delete'; tokenHash: string }
    | { type: 'set'; tokenHash: string; value: PairingTokenIndexValue }

export type PairingRemoteConnectionOp =
    | { type: 'clear-all'; pairingId: string }
    | { type: 'replace-all'; connection: PairingRemoteConnectionRecord }

export type PairingTransientOp = { type: 'clear-all'; pairingId: string }

export type PairingSessionTransition = {
    nextSession: PairingSessionRecord
    remoteConnectionOps: PairingRemoteConnectionOp[]
    tokenIndexOps: PairingTokenIndexOp[]
    transientOps: PairingTransientOp[]
}

export function createPairingRemoteConnection(
    pairingId: string,
    deviceId: string,
    connection: PairingRemoteConnectionDraft,
    at: number
): PairingRemoteConnectionRecord {
    return {
        id: connection.connectionId,
        connectionId: connection.connectionId,
        pairingId,
        deviceId,
        tokenHash: connection.participant.tokenHash,
        channel: 'tunnel',
        createdAt: at,
        lastSeenAt: at,
    }
}

export function expirePairingSessionIfNeeded(
    session: PairingSessionRecord,
    remoteConnections: readonly PairingRemoteConnectionRecord[],
    at: number
): PairingSessionTransition | null {
    if (!isActiveState(session.state) || at < session.expiresAt) return null

    const nextSession: PairingSessionRecord = {
        ...session,
        state: 'expired',
        updatedAt: at,
        shortCode: session.shortCode,
        approvalStatus: session.approvalStatus,
        host: { ...session.host, connectedAt: undefined },
        authorizedDevice: session.authorizedDevice,
    }

    return {
        nextSession,
        tokenIndexOps: deleteSessionTokenIndexes(session, remoteConnections),
        remoteConnectionOps: [{ type: 'clear-all', pairingId: session.id }],
        transientOps: [{ type: 'clear-all', pairingId: session.id }],
    }
}

export function approvePairingSession(options: {
    at: number
    connection: PairingRemoteConnectionDraft
    device: PairingSessionRecord['authorizedDevice']
    providedCode: string
    session: PairingSessionRecord
}): PairingSessionTransition | null {
    const { at, connection, device, providedCode, session } = options
    if (!device) return null
    if (!isActiveState(session.state) || session.authorizedDevice) return null
    if (session.shortCode === null || session.shortCode !== providedCode) return null

    const nextSession = updatePairingSessionState({
        ...session,
        updatedAt: at,
        approvalStatus: 'approved',
        authorizedDevice: { ...device },
    })
    const remoteConnection = createPairingRemoteConnection(session.id, device.id, connection, at)

    return {
        nextSession,
        tokenIndexOps: [setGuestTokenIndex(remoteConnection)],
        remoteConnectionOps: [{ type: 'replace-all', connection: remoteConnection }],
        transientOps: [],
    }
}

export function renewPairingSession(
    session: PairingSessionRecord,
    expiresAt: number,
    at: number
): PairingSessionTransition | null {
    if (!isActiveState(session.state)) return null
    return {
        nextSession: { ...session, expiresAt: Math.max(session.expiresAt, expiresAt), updatedAt: at },
        tokenIndexOps: [],
        remoteConnectionOps: [],
        transientOps: [],
    }
}

export function addPairingRemoteConnection(options: {
    at: number
    connection: PairingRemoteConnectionDraft
    session: PairingSessionRecord
}): PairingSessionTransition | null {
    const { at, connection, session } = options
    const device = session.authorizedDevice
    if (!isActiveState(session.state) || !device || session.approvalStatus !== 'approved') return null

    const nextSession = updatePairingSessionState({
        ...session,
        updatedAt: at,
        authorizedDevice: { ...device, lastSeenAt: at },
    })
    const remoteConnection = createPairingRemoteConnection(session.id, device.id, connection, at)

    return {
        nextSession,
        tokenIndexOps: [setGuestTokenIndex(remoteConnection)],
        remoteConnectionOps: [
            { type: 'clear-all', pairingId: session.id },
            { type: 'replace-all', connection: remoteConnection },
        ],
        transientOps: [],
    }
}

export function deletePairingSession(
    session: PairingSessionRecord,
    remoteConnections: readonly PairingRemoteConnectionRecord[],
    at: number
): PairingSessionTransition {
    return {
        nextSession: {
            ...session,
            state: 'deleted',
            updatedAt: at,
            host: { ...session.host, connectedAt: undefined },
            authorizedDevice: session.authorizedDevice,
        },
        tokenIndexOps: deleteSessionTokenIndexes(session, remoteConnections),
        remoteConnectionOps: [{ type: 'clear-all', pairingId: session.id }],
        transientOps: [{ type: 'clear-all', pairingId: session.id }],
    }
}

export function updatePairingSessionState(session: PairingSessionRecord): PairingSessionRecord {
    return {
        ...session,
        state: isActiveState(session.state) ? 'active' : session.state,
    }
}

function isActiveState(state: PairingSessionRecord['state']): boolean {
    return state === 'active' || state === 'waiting'
}

function setGuestTokenIndex(connection: PairingRemoteConnectionRecord): PairingTokenIndexOp {
    return {
        type: 'set',
        tokenHash: connection.tokenHash,
        value: {
            connectionId: connection.connectionId,
            pairingId: connection.pairingId,
            role: 'guest',
        },
    }
}

function deleteSessionTokenIndexes(
    session: PairingSessionRecord,
    remoteConnections: readonly PairingRemoteConnectionRecord[]
): PairingTokenIndexOp[] {
    return [
        { type: 'delete', tokenHash: session.host.tokenHash },
        ...remoteConnections.map((connection) => ({ type: 'delete' as const, tokenHash: connection.tokenHash })),
    ]
}
