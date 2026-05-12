import { PAIRING_MOBILE_DISCONNECT_GRACE_MS, type PairingRole } from '@viby/protocol/pairing'
import type { ConnectionState, PairingConnection } from './wsTypes'

export const DEFAULT_PARTICIPANT_DISCONNECT_GRACE_MS = PAIRING_MOBILE_DISCONNECT_GRACE_MS

export function createPairingDisconnectGrace(options: {
    disconnectGraceMs?: number
    onExpire: (connection: PairingConnection) => void
}) {
    const delayMs = options.disconnectGraceMs ?? DEFAULT_PARTICIPANT_DISCONNECT_GRACE_MS

    function cancel(state: ConnectionState, role: PairingRole): void {
        const timer = state.disconnectTimers.get(role)
        if (!timer) return
        clearTimeout(timer)
        state.disconnectTimers.delete(role)
    }

    function schedule(state: ConnectionState, connection: PairingConnection): void {
        cancel(state, connection.role)
        const timer = setTimeout(() => {
            state.disconnectTimers.delete(connection.role)
            options.onExpire(connection)
        }, delayMs)
        state.disconnectTimers.set(connection.role, timer)
    }

    function clearAll(state: ConnectionState): void {
        for (const timer of state.disconnectTimers.values()) clearTimeout(timer)
        state.disconnectTimers.clear()
    }

    return { schedule, cancel, clearAll }
}
