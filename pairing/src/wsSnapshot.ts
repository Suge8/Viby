import type { ConnectionState, PairingSocketHubSnapshot } from './wsTypes'

export function snapshotPairingSocketHub(
    states: Iterable<ConnectionState>,
    activeSessions: number
): PairingSocketHubSnapshot {
    const snapshot = { activeSessions, activeSockets: 0, pairedSessions: 0, disconnectGraceTimers: 0 }
    for (const state of states) {
        snapshot.activeSockets += state.sockets.size
        snapshot.disconnectGraceTimers += state.disconnectTimers.size
        if (state.sockets.size === 2) snapshot.pairedSessions += 1
    }
    return snapshot
}
