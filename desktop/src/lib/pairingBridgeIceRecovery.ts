import { PAIRING_ICE_RESTART_MIN_INTERVAL_MS } from '@viby/protocol/pairing'

const ICE_RESTART_MIN_INTERVAL_MS = PAIRING_ICE_RESTART_MIN_INTERVAL_MS

export function createPairingBridgeIceRestartGate(options: { now?: () => number } = {}) {
    let lastRestartAt = Number.NEGATIVE_INFINITY

    function canRestart(): boolean {
        const now = options.now?.() ?? Date.now()
        if (now - lastRestartAt < ICE_RESTART_MIN_INTERVAL_MS) {
            return false
        }
        lastRestartAt = now
        return true
    }

    return { canRestart }
}
