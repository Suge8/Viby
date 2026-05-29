import type { QueryClient } from '@tanstack/react-query'
import type { PairingTransportState } from '@viby/protocol/pairing'
import { useEffect } from 'react'
import type { RemotePairingReadyConnection } from './RemotePairingReadyShell'
import { recordRemotePairingDiagnostic } from './remotePairingDiagnostics'
import { pauseRemotePairingQueries, resumeRemotePairingQueries } from './remotePairingQueryOnlineState'
import type { RemotePairingConnectionChrome } from './remotePairingViewModel'

export function useRemoteTransportSnapshot(options: {
    activeReady: RemotePairingReadyConnection | null
    connectingSnapshot: PairingTransportState
    setTransportState(state: PairingTransportState): void
}): void {
    const { activeReady, connectingSnapshot, setTransportState } = options
    useEffect(() => {
        if (!activeReady) return setTransportState(connectingSnapshot)
        setTransportState(activeReady.bridge.getSnapshot())
        return activeReady.bridge.transportSubscribe(() => {
            const snapshot = activeReady.bridge.getSnapshot()
            recordRemotePairingDiagnostic('transport', {
                state: snapshot.kind,
                attempt: snapshot.kind === 'connecting' ? snapshot.attempt : null,
            })
            setTransportState(snapshot)
        })
    }, [activeReady, connectingSnapshot, setTransportState])
}

export function useRemoteQueryOnlineBridge(options: {
    chrome: RemotePairingConnectionChrome
    queryClient: QueryClient
    running: boolean
}): void {
    const { chrome, queryClient, running } = options
    useEffect(() => {
        if (chrome.reconnect) return pauseRemotePairingQueries(queryClient)
        resumeRemotePairingQueries(queryClient, { refetch: running })
    }, [chrome.reconnect, queryClient, running])
}
