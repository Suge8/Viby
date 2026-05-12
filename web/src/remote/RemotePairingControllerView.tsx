import { type JSX } from 'react'
import { AppInstallPromptLayer } from '@/components/AppInstallPromptLayer'
import { RemotePairingHydrateSkeleton } from '@/remote/RemotePairingHydrateSkeleton'
import type { RemotePairingReadyConnection } from '@/remote/RemotePairingReadyShell'
import { RemotePairingReadyShell } from '@/remote/RemotePairingReadyShell'
import { RemotePairingCodeScreen, RemotePairingStatusScreen } from '@/remote/RemotePairingScreens'
import { type RemoteState } from './RemotePairingController'
import { buildRemoteStatusSpec, shouldBlockRemoteReadyShellInteraction } from './remotePairingViewModel'

type ControllerViewProps = {
    activeReady: RemotePairingReadyConnection | null
    installPromptVisible: boolean
    onVerify(code: string): void
    pathname: string
    state: RemoteState
}

export function RemotePairingControllerView(props: ControllerViewProps): JSX.Element | null {
    const { activeReady, state } = props
    if (activeReady && props.pathname.startsWith('/sessions')) {
        return (
            <>
                <RemotePairingReadyShell
                    enableRuntime={state.kind === 'running'}
                    interactionBlocked={shouldBlockRemoteReadyShellInteraction(state)}
                    pathname={props.pathname}
                    ready={activeReady}
                />
                {props.installPromptVisible ? <AppInstallPromptLayer /> : null}
            </>
        )
    }
    if (state.kind === 'hydrating') return <RemotePairingHydrateSkeleton />
    if (state.kind === 'first-pairing') {
        return state.submitting ? (
            <RemotePairingStatusScreen message={null} phase="verify" />
        ) : (
            <RemotePairingCodeScreen onSubmit={props.onVerify} submitting={false} />
        )
    }
    if (state.kind !== 'fatal') return null
    const spec = buildRemoteStatusSpec(state.errorKey)
    return <RemotePairingStatusScreen message={spec.messageKey} phase="pairing" />
}
