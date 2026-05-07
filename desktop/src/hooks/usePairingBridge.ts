import { useEffect, useState } from 'react'
import { startPairingBridge } from '@/lib/pairingBridgeController'
import type { DesktopPairingSession, HubRuntimeStatus, PairingBridgeState } from '@/types'

function isPairingBridgeRuntimeReady(status: HubRuntimeStatus | undefined): status is HubRuntimeStatus {
    return status?.phase === 'ready'
}

export function createPairingBridgeDependencyKey(
    pairing: DesktopPairingSession | null,
    status: HubRuntimeStatus | undefined
): string {
    if (!pairing || !isPairingBridgeRuntimeReady(status)) {
        return 'idle'
    }

    return [pairing.pairing.id, pairing.wsUrl, status.localHubUrl, status.cliApiToken].join('|')
}

export function usePairingBridge(options: {
    pairing: DesktopPairingSession | null
    status: HubRuntimeStatus | undefined
}): PairingBridgeState {
    const [state, setState] = useState<PairingBridgeState>({ phase: 'idle', message: null, pairing: null, stats: null })
    const dependencyKey = createPairingBridgeDependencyKey(options.pairing, options.status)

    useEffect(() => {
        if (!options.pairing || !isPairingBridgeRuntimeReady(options.status)) {
            setState({ phase: 'idle', message: null, pairing: null, stats: null })
            return
        }

        return startPairingBridge({
            pairing: options.pairing,
            status: options.status,
            onStateChange: setState,
        })
    }, [dependencyKey])

    return state
}
