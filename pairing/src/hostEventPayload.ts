import {
    type PairingHostEvent,
    type PairingRemoteConnectionSnapshot,
    type PairingSessionRecord,
    toPairingRemoteConnectionSnapshot,
    toPairingSessionSnapshot,
} from '@viby/protocol/pairing'
import type { PairingRemoteConnectionRecord, PairingStore } from './storeTypes'

export function toRemoteConnectionSnapshots(
    connections: readonly PairingRemoteConnectionRecord[],
    activeConnectionIds?: ReadonlySet<string>
): PairingRemoteConnectionSnapshot[] {
    return connections.map((connection) =>
        toPairingRemoteConnectionSnapshot(
            activeConnectionIds?.has(connection.connectionId) === false
                ? { ...connection, connectedAt: undefined }
                : connection
        )
    )
}

export function buildPairingHostEvent(
    session: PairingSessionRecord,
    connections: readonly PairingRemoteConnectionRecord[],
    activeConnectionIds?: ReadonlySet<string>
): PairingHostEvent {
    return {
        type: 'pairing.updated',
        pairing: toPairingSessionSnapshot(session),
        remoteConnections: toRemoteConnectionSnapshots(connections, activeConnectionIds),
    }
}

export async function buildPairingHostEventFromStore(
    store: PairingStore,
    session: PairingSessionRecord,
    getActiveRemoteConnectionIds?: (pairingId: string) => ReadonlySet<string>
): Promise<PairingHostEvent> {
    return buildPairingHostEvent(
        session,
        await store.getRemoteConnections(session.id),
        getActiveRemoteConnectionIds?.(session.id)
    )
}
