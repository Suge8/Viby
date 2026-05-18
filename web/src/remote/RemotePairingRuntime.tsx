import { type JSX, lazy, Suspense, useEffect } from 'react'
import type { ApiClient } from '@/api/client'
import { useRealtimeEventBridge } from '@/hooks/useRealtimeConnection'
import { useRealtimeFeedback } from '@/hooks/useRealtimeFeedback'
import { reportWebRuntimeError } from '@/lib/runtimeDiagnostics'
import type { RemotePeerBridge } from '@/remote/remotePairingBridgeTypes'
import type { RemotePeerTransportStats } from './remotePairingStats'

async function loadAppFloatingNoticeLayerModule() {
    const module = await import('@/components/AppFloatingNoticeLayer')
    return { default: module.AppFloatingNoticeLayer }
}

const LazyAppFloatingNoticeLayer = lazy(loadAppFloatingNoticeLayerModule)

type RemotePairingRuntimeProps = {
    api: ApiClient
    bridge: RemotePeerBridge
}

export function RemotePairingRuntime(props: RemotePairingRuntimeProps): JSX.Element {
    const { banner, handleConnect, handleDisconnect } = useRealtimeFeedback()

    useEffect(() => {
        let disposed = false
        let firstSample = true
        let reportedStatsFailure = false

        handleConnect({ initial: true, recovered: false, transport: null })

        function publishInitialTransport(transport: RemotePeerTransportStats['transport']): void {
            if (!firstSample) {
                return
            }

            firstSample = false
            handleConnect({ initial: false, recovered: false, transport })
        }

        async function sampleTransport(): Promise<void> {
            try {
                const stats = await props.bridge.getTransportStats()
                if (disposed) {
                    return
                }
                publishInitialTransport(stats.transport)
            } catch (error) {
                if (!disposed) {
                    if (!reportedStatsFailure) {
                        reportedStatsFailure = true
                        reportWebRuntimeError('Remote pairing transport stats failed.', error)
                    }
                    publishInitialTransport('unknown')
                }
            }
        }

        void sampleTransport()

        return () => {
            disposed = true
        }
    }, [handleConnect, props.bridge])

    useRealtimeEventBridge({
        enabled: true,
        subscribe: props.bridge.subscribe,
        onEvent: () => {},
    })

    useEffect(() => {
        return () => {
            handleDisconnect('closed')
        }
    }, [handleDisconnect])

    return (
        <Suspense fallback={null}>
            <LazyAppFloatingNoticeLayer api={props.api} banner={banner} />
        </Suspense>
    )
}
