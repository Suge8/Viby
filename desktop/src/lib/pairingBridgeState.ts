import type { PairingBridgeState, PairingBridgeStats, PairingSessionSnapshot } from '@/types'
import { PAIRING_STALE_MESSAGE } from './pairingBridgeRecovery'
import { describePairingConnectionState } from './pairingBridgeSupport'

type PairingBridgeStatePatch = Omit<PairingBridgeState, 'pairing'> & {
    pairing?: PairingSessionSnapshot | null
    stats?: PairingBridgeStats | null
}

export function createPairingBridgeStateController(options: {
    initialPairing: PairingSessionSnapshot
    isDisposed: () => boolean
    isLiveTransport: () => boolean
    onStateChange: (state: PairingBridgeState) => void
}) {
    let pairing = options.initialPairing
    let phase: PairingBridgeState['phase'] = 'connecting'
    let message: string | null = '正在建立点对点链路。'
    let stats: PairingBridgeStats | null = null

    function normalize(patch: PairingBridgeStatePatch): PairingBridgeStatePatch {
        if (phase === 'error' && message === PAIRING_STALE_MESSAGE) {
            return { ...patch, phase, message }
        }
        if ((patch.phase === 'connecting' || patch.phase === 'paused') && options.isLiveTransport()) {
            return { ...patch, phase: 'ready', message: describePairingConnectionState('connected') }
        }
        return patch
    }

    function emit(): void {
        if (options.isDisposed()) return
        options.onStateChange({ phase, message, pairing, stats })
    }

    function setState(patch: PairingBridgeStatePatch): void {
        const next = normalize(patch)
        phase = next.phase
        message = next.message
        if (next.pairing) pairing = next.pairing
        if (typeof next.stats !== 'undefined') stats = next.stats
        emit()
    }

    function setStats(nextStats: PairingBridgeStats): void {
        stats = nextStats
        emit()
    }

    function getPairing(): PairingSessionSnapshot {
        return pairing
    }

    return { getPairing, setState, setStats }
}
