import { type JSX } from 'react'
import { AppInstallPromptLayer } from '@/components/AppInstallPromptLayer'
import { useTranslation } from '@/lib/use-translation'
import { RemotePairingHydrateSkeleton } from '@/remote/RemotePairingHydrateSkeleton'
import type { RemotePairingReadyConnection } from '@/remote/RemotePairingReadyShell'
import { RemotePairingReadyShell } from '@/remote/RemotePairingReadyShell'
import { RemotePairingCodeScreen, RemotePairingStatusScreen } from '@/remote/RemotePairingScreens'
import { type RemoteState } from './RemotePairingController'
import { buildRemoteStatusSpec } from './remotePairingViewModel'

type ControllerViewProps = {
    activeReady: RemotePairingReadyConnection | null
    installPromptVisible: boolean
    interactionBlocked: boolean
    onRetry(): void
    onVerify(code: string): void
    pathname: string
    state: RemoteState
}

export function RemotePairingControllerView(props: ControllerViewProps): JSX.Element | null {
    const { activeReady, state } = props
    const { t } = useTranslation()
    if (activeReady) {
        if (!props.pathname.startsWith('/sessions')) {
            return <RemotePairingStatusScreen message={null} phase="pairing" />
        }
        return (
            <>
                <RemotePairingReadyShell
                    enableRuntime={state.kind === 'running'}
                    interactionBlocked={props.interactionBlocked}
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
    return (
        <RemotePairingStatusScreen
            message={spec.messageKey ? t(spec.messageKey) : null}
            onRetry={spec.retry ? props.onRetry : undefined}
            phase="pairing"
        />
    )
}
