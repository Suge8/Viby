export type RemotePairingRenderState = {
    kind: 'approval' | 'booting' | 'error' | 'ready' | 'reconnecting'
}

export function shouldShowRemoteReconnectNotice(state: RemotePairingRenderState, hasRetainedReady: boolean): boolean {
    return hasRetainedReady && (state.kind === 'reconnecting' || state.kind === 'booting')
}

export function shouldBlockRemoteReadyShellInteraction(state: RemotePairingRenderState): boolean {
    return state.kind === 'booting' || state.kind === 'reconnecting'
}

export function shouldRenderRemoteReadyShell(options: {
    hasRetainedReady: boolean
    pathname: string
    state: RemotePairingRenderState
}): boolean {
    if (!options.pathname.startsWith('/sessions')) {
        return false
    }

    if (options.state.kind === 'ready') {
        return true
    }

    return options.hasRetainedReady && (options.state.kind === 'booting' || options.state.kind === 'reconnecting')
}
