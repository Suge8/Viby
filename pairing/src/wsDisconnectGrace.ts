import { PAIRING_MOBILE_DISCONNECT_GRACE_MS } from '@viby/protocol/pairing'
import type { ConnectionState, PairingConnection } from './wsTypes'
export const DEFAULT_PARTICIPANT_DISCONNECT_GRACE_MS = PAIRING_MOBILE_DISCONNECT_GRACE_MS
export function createPairingDisconnectGrace(options: {
    disconnectGraceMs?: number
    onExpire: (connection: PairingConnection) => void
    scheduleTimeout?: (callback: () => void, delayMs: number) => () => void
}) {
    const delayMs = options.disconnectGraceMs ?? DEFAULT_PARTICIPANT_DISCONNECT_GRACE_MS
    const scheduleTimeout = options.scheduleTimeout ?? defaultScheduleTimeout
    function cancel(state: ConnectionState, connectionKey: string): void {
        const cancelTimer = state.disconnectTimers.get(connectionKey)
        if (!cancelTimer) return
        cancelTimer()
        state.disconnectTimers.delete(connectionKey)
        state.disconnectTimerRoles.delete(connectionKey)
    }
    function schedule(state: ConnectionState, connection: PairingConnection): void {
        cancel(state, connection.connectionKey)
        const cancelTimer = scheduleTimeout(() => {
            state.disconnectTimers.delete(connection.connectionKey)
            state.disconnectTimerRoles.delete(connection.connectionKey)
            options.onExpire(connection)
        }, delayMs)
        state.disconnectTimers.set(connection.connectionKey, cancelTimer)
        state.disconnectTimerRoles.set(connection.connectionKey, connection.role)
    }
    function clearAll(state: ConnectionState): void {
        for (const cancelTimer of state.disconnectTimers.values()) cancelTimer()
        state.disconnectTimers.clear()
        state.disconnectTimerRoles.clear()
    }
    return { schedule, cancel, clearAll }
}

function defaultScheduleTimeout(callback: () => void, delayMs: number): () => void {
    const timer = setTimeout(callback, delayMs)
    if (typeof timer === 'object' && 'unref' in timer) timer.unref()
    return () => clearTimeout(timer)
}
