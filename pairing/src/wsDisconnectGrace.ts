import { PAIRING_MOBILE_DISCONNECT_GRACE_MS } from '@viby/protocol/pairing'
import type { ConnectionState, PairingConnection } from './wsTypes'
export const DEFAULT_PARTICIPANT_DISCONNECT_GRACE_MS = PAIRING_MOBILE_DISCONNECT_GRACE_MS
export function createPairingDisconnectGrace(options: {
    disconnectGraceMs?: number
    onExpire: (connection: PairingConnection) => void
}) {
    const delayMs = options.disconnectGraceMs ?? DEFAULT_PARTICIPANT_DISCONNECT_GRACE_MS
    function cancel(state: ConnectionState, connectionKey: string): void {
        const timer = state.disconnectTimers.get(connectionKey)
        if (!timer) return
        clearTimeout(timer)
        state.disconnectTimers.delete(connectionKey)
        state.disconnectTimerRoles.delete(connectionKey)
    }
    function schedule(state: ConnectionState, connection: PairingConnection): void {
        cancel(state, connection.connectionKey)
        const timer = setTimeout(() => {
            state.disconnectTimers.delete(connection.connectionKey)
            state.disconnectTimerRoles.delete(connection.connectionKey)
            options.onExpire(connection)
        }, delayMs)
        state.disconnectTimers.set(connection.connectionKey, timer)
        state.disconnectTimerRoles.set(connection.connectionKey, connection.role)
    }
    function clearAll(state: ConnectionState): void {
        for (const timer of state.disconnectTimers.values()) clearTimeout(timer)
        state.disconnectTimers.clear()
        state.disconnectTimerRoles.clear()
    }
    return { schedule, cancel, clearAll }
}
