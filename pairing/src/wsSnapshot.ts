import type { ConnectionState, PairingSocketHubSnapshot } from './wsTypes'

export function snapshotPairingSocketHub(
    states: Iterable<readonly [string, ConnectionState]>,
    activeSessions: number
): PairingSocketHubSnapshot {
    const snapshot = {
        activeSessions,
        activeSockets: 0,
        activeRemoteConnections: 0,
        disconnectGraceByRole: { guest: 0, host: 0 },
        disconnectGraceTimers: 0,
        maxRemoteConnectionsPerPairing: 0,
        pairedSessions: 0,
        pairingsWithRemoteConnections: 0,
    }
    for (const [, state] of states) {
        const guestSocketCount = state.sockets.has('guest') ? 1 : 0
        snapshot.activeSockets += (state.sockets.has('host') ? 1 : 0) + guestSocketCount
        snapshot.activeRemoteConnections += guestSocketCount
        snapshot.disconnectGraceTimers += state.disconnectTimers.size
        snapshot.maxRemoteConnectionsPerPairing = Math.max(snapshot.maxRemoteConnectionsPerPairing, guestSocketCount)
        if (guestSocketCount > 0) snapshot.pairingsWithRemoteConnections += 1
        if (state.sockets.has('host') && guestSocketCount > 0) snapshot.pairedSessions += 1
        for (const role of state.disconnectTimerRoles.values()) snapshot.disconnectGraceByRole[role] += 1
    }
    return snapshot
}
