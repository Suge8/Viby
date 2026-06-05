import { type JSX, lazy, Suspense, useEffect } from 'react'
import { useRealtimeEventBridge } from '@/hooks/useRealtimeConnection'
import { useRealtimeFeedback } from '@/hooks/useRealtimeFeedback'
import { reportWebRuntimeError } from '@/lib/runtimeDiagnostics'
import type { RemotePeerTransportStats } from './remotePairingStats'
import type { RemoteWorkspaceRuntime } from './remoteWorkspaceAdapter'

async function loadAppFloatingNoticeLayerModule() {
    const module = await import('@/components/AppFloatingNoticeLayer')
    return { default: module.AppFloatingNoticeLayer }
}

const LazyAppFloatingNoticeLayer = lazy(loadAppFloatingNoticeLayerModule)

type RemotePairingRuntimeProps = {
    runtime: RemoteWorkspaceRuntime
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
                const stats = await props.runtime.getTransportStats()
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
    }, [handleConnect, props.runtime])

    useRealtimeEventBridge({
        enabled: true,
        subscribe: props.runtime.subscribe,
        onEvent: () => {},
    })

    useEffect(() => {
        return () => {
            handleDisconnect('closed')
        }
    }, [handleDisconnect])

    return (
        <Suspense fallback={null}>
            <LazyAppFloatingNoticeLayer api={props.runtime.noticeApi} banner={banner} />
        </Suspense>
    )
}
