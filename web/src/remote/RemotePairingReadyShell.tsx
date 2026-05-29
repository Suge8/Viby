import { useQueryClient } from '@tanstack/react-query'
import type { PairingTransportState } from '@viby/protocol/pairing'
import { lazy, Suspense, useMemo } from 'react'
import { AppReadyShell } from '@/components/appControllerSupport'
import { getAppViewportRoute } from '@/lib/appShellPresentation'
import { RemotePeerBridgeProvider } from '@/remote/remoteBridgeContext'
import type { RemotePeerBridge } from '@/remote/remotePairingBridgeTypes'
import { createRemotePeerApiClient } from '@/remote/remotePeerApiClient'
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
    const api = useMemo(
        () => createRemotePeerApiClient({ bridge: props.ready.bridge, queryClient }),
        [props.ready.bridge, queryClient]
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
                        session={{ api, token: props.ready.token, baseUrl: location.origin }}
                    >
                        {props.enableRuntime ? (
                            <Suspense fallback={null}>
                                <LazyRemotePairingRuntime api={api} bridge={props.ready.bridge} />
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
