import { type JSX, lazy, Suspense } from 'react'
import { useRealtimeEventBridge } from '@/hooks/useRealtimeConnection'
import type { RealtimeBannerState } from '@/hooks/useRealtimeFeedback'
import type { RemoteWorkspaceRuntime } from './remoteWorkspaceAdapter'

async function loadAppFloatingNoticeLayerModule() {
    const module = await import('@/components/AppFloatingNoticeLayer')
    return { default: module.AppFloatingNoticeLayer }
}

const LazyAppFloatingNoticeLayer = lazy(loadAppFloatingNoticeLayerModule)
const REMOTE_REALTIME_BANNER: RealtimeBannerState = { kind: 'hidden' }

type RemotePairingRuntimeProps = {
    runtime: RemoteWorkspaceRuntime
}

export function RemotePairingRuntime(props: RemotePairingRuntimeProps): JSX.Element {
    useRealtimeEventBridge({
        enabled: true,
        subscribe: props.runtime.subscribe,
        onEvent: () => {},
    })

    return (
        <Suspense fallback={null}>
            <LazyAppFloatingNoticeLayer api={props.runtime.noticeApi} banner={REMOTE_REALTIME_BANNER} />
        </Suspense>
    )
}
