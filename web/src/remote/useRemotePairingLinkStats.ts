import { PAIRING_STATS_POLL_INTERVAL_MS } from '@viby/protocol/pairing'
import { useEffect, useState } from 'react'
import { reportWebRuntimeError } from '@/lib/runtimeDiagnostics'
import type { RemotePeerBridge } from './remotePairingBridgeTypes'
import type { RemotePeerTransportStats } from './remotePairingStats'

export type RemotePairingLinkBridge = RemotePeerBridge & {
    transportSubscribe(listener: () => void): () => void
}

export function useRemotePairingLinkStats(bridge: RemotePairingLinkBridge): RemotePeerTransportStats | null {
    const [stats, setStats] = useState<RemotePeerTransportStats | null>(null)

    useEffect(() => {
        let disposed = false
        let reportedFailure = false

        async function sample(): Promise<void> {
            try {
                const nextStats = await bridge.getTransportStats()
                if (!disposed) setStats(nextStats)
            } catch (error) {
                if (disposed) return
                setStats(null)
                if (reportedFailure) return
                reportedFailure = true
                reportWebRuntimeError('Remote pairing link stats failed.', error)
            }
        }

        const unsubscribe = bridge.transportSubscribe(() => void sample())
        const intervalId = window.setInterval(() => void sample(), PAIRING_STATS_POLL_INTERVAL_MS)
        void sample()

        return () => {
            disposed = true
            window.clearInterval(intervalId)
            unsubscribe()
        }
    }, [bridge])

    return stats
}
