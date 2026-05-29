import { type JSX } from 'react'
import { AppInstallPromptLayer } from '@/components/AppInstallPromptLayer'
import { useTranslation } from '@/lib/use-translation'
import type { RemotePairingReadyConnection } from '@/remote/RemotePairingReadyShell'
import { RemotePairingReadyShell } from '@/remote/RemotePairingReadyShell'
import { RemotePairingCodeScreen, RemotePairingStatusScreen } from '@/remote/RemotePairingScreens'
import { type RemoteState } from './RemotePairingController'
import { buildRemoteStatusSpec, type RemotePairingLinkBadgeOverride } from './remotePairingViewModel'

type ControllerViewProps = {
    activeReady: RemotePairingReadyConnection | null
    installPromptVisible: boolean
    interactionBlocked: boolean
    linkBadgeOverride: RemotePairingLinkBadgeOverride | null
    onRetry(): void
    onVerify(code: string): void
    pathname: string
    state: RemoteState
}

export function RemotePairingControllerView(props: ControllerViewProps): JSX.Element | null {
    const { activeReady, state } = props
    const { t } = useTranslation()
    if (activeReady) {
        const readyPathname = props.pathname.startsWith('/sessions') ? props.pathname : '/sessions'
        return (
            <>
                <RemotePairingReadyShell
                    enableRuntime={state.kind === 'running'}
                    interactionBlocked={props.interactionBlocked}
                    linkBadgeOverride={props.linkBadgeOverride}
                    pathname={readyPathname}
                    ready={activeReady}
                />
                {props.installPromptVisible ? <AppInstallPromptLayer /> : null}
            </>
        )
    }
    if (state.kind === 'hydrating') return <RemotePairingStatusScreen message={null} phase={state.phase} />
    if (state.kind === 'code-input') {
        return state.submitting ? (
            <RemotePairingStatusScreen message={null} phase="verifying-code" />
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
            phase="recovering-device"
        />
    )
}
