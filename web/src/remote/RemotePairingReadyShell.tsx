import { useQueryClient } from '@tanstack/react-query'
import type { PairingTransportState } from '@viby/protocol/pairing'
import { lazy, Suspense, useMemo } from 'react'
import { AppReadyShell } from '@/components/appControllerSupport'
import { getAppViewportRoute } from '@/lib/appShellPresentation'
import { RemotePeerBridgeProvider } from '@/remote/remoteBridgeContext'
import type { RemotePeerBridge } from '@/remote/remotePairingBridgeTypes'
import { createRemoteWorkspaceAdapter } from '@/remote/remoteWorkspaceAdapter'
import { RemotePairingLinkBadge } from './RemotePairingLinkBadge'
import { RemotePairingInteractionProvider } from './remotePairingInteractionState'
import type { RemotePairingLinkBadgeOverride } from './remotePairingViewModel'

async function loadRemotePairingRuntimeModule() {
    const module = await import('@/remote/RemotePairingRuntime')
    return { default: module.RemotePairingRuntime }
}

const LazyRemotePairingRuntime = lazy(loadRemotePairingRuntimeModule)

export type RemotePairingReadyConnection = {
    bridge: RemotePeerBridge & {
        transportSubscribe(listener: () => void): () => void
        getSnapshot(): PairingTransportState
    }
    token: string
}

type RemotePairingReadyShellProps = {
    enableRuntime: boolean
    interactionBlocked: boolean
    linkBadgeOverride: RemotePairingLinkBadgeOverride | null
    pathname: string
    ready: RemotePairingReadyConnection
}

export function RemotePairingReadyShell(props: RemotePairingReadyShellProps): React.JSX.Element {
    const queryClient = useQueryClient()
    const workspace = useMemo(
        () =>
            createRemoteWorkspaceAdapter({
                baseUrl: location.origin,
                bridge: props.ready.bridge,
                queryClient,
                token: props.ready.token,
            }),
        [props.ready.bridge, props.ready.token, queryClient]
    )

    return (
        <RemotePairingInteractionProvider blocked={props.interactionBlocked}>
            <RemotePeerBridgeProvider bridge={props.ready.bridge}>
                <div
                    className="h-full min-h-0"
                    aria-busy={props.interactionBlocked || undefined}
                    inert={props.interactionBlocked ? true : undefined}
                >
                    <AppReadyShell
                        appViewportRoute={getAppViewportRoute(props.pathname)}
                        session={workspace.appSession}
                    >
                        {props.enableRuntime ? (
                            <Suspense fallback={null}>
                                <LazyRemotePairingRuntime runtime={workspace.runtime} />
                            </Suspense>
                        ) : null}
                    </AppReadyShell>
                    <RemotePairingLinkBadge bridge={props.ready.bridge} override={props.linkBadgeOverride} />
                </div>
                {props.interactionBlocked ? (
                    <div className="fixed inset-0 z-40 bg-black/35 backdrop-blur-sm" aria-hidden="true" />
                ) : null}
            </RemotePeerBridgeProvider>
        </RemotePairingInteractionProvider>
    )
}
