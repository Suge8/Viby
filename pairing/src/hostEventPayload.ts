import {
    type PairingHostEvent,
    type PairingRemoteConnectionSnapshot,
    type PairingSessionRecord,
    toPairingRemoteConnectionSnapshot,
    toPairingSessionSnapshot,
} from '@viby/protocol/pairing'
import type { PairingRemoteConnectionRecord, PairingStore } from './storeTypes'

export function toRemoteConnectionSnapshots(
    connections: readonly PairingRemoteConnectionRecord[]
): PairingRemoteConnectionSnapshot[] {
    return connections.map(toPairingRemoteConnectionSnapshot)
}

export function buildPairingHostEvent(
    session: PairingSessionRecord,
    connections: readonly PairingRemoteConnectionRecord[]
): PairingHostEvent {
    return {
        type: 'pairing.updated',
        pairing: toPairingSessionSnapshot(session),
        remoteConnections: toRemoteConnectionSnapshots(connections),
    }
}

export async function buildPairingHostEventFromStore(
    store: PairingStore,
    session: PairingSessionRecord
): Promise<PairingHostEvent> {
    return buildPairingHostEvent(session, await store.getRemoteConnections(session.id))
}
