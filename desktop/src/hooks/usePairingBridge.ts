import { useEffect, useState } from 'react'
import { startPairingBridge } from '@/lib/pairingBridgeController'
import type { DesktopPairingSession, HubRuntimeStatus, PairingBridgeState } from '@/types'

export function usePairingBridge(options: {
    pairing: DesktopPairingSession | null
    status: HubRuntimeStatus | undefined
}): PairingBridgeState {
    const [state, setState] = useState<PairingBridgeState>({ phase: 'idle', message: null, pairing: null, stats: null })

    useEffect(() => {
        if (!options.pairing || !options.status) {
            setState({ phase: 'idle', message: null, pairing: null, stats: null })
            return
        }

        return startPairingBridge({
            pairing: options.pairing,
            status: options.status,
            onStateChange: setState,
        })
    }, [options.pairing, options.status])

    return state
}
