export type RemoteConnectingPhase =
    | 'opening-app'
    | 'recovering-device'
    | 'authenticating'
    | 'verifying-code'
    | 'opening-relay'
    | 'connecting-computer'
    | 'loading-workspace'

type PhaseDefinition = {
    progress: number
    stepKey: string
}

const PHASE_DEFINITIONS: Record<RemoteConnectingPhase, PhaseDefinition> = {
    'opening-app': { progress: 0.08, stepKey: 'remotePairing.connecting.phase.openingApp' },
    'recovering-device': { progress: 0.22, stepKey: 'remotePairing.connecting.phase.recoveringDevice' },
    authenticating: { progress: 0.38, stepKey: 'remotePairing.connecting.phase.authenticating' },
    'verifying-code': { progress: 0.5, stepKey: 'remotePairing.connecting.phase.verifyingCode' },
    'opening-relay': { progress: 0.62, stepKey: 'remotePairing.connecting.phase.openingRelay' },
    'connecting-computer': { progress: 0.78, stepKey: 'remotePairing.connecting.phase.connectingComputer' },
    'loading-workspace': { progress: 0.92, stepKey: 'remotePairing.connecting.phase.loadingWorkspace' },
}

export function getRemoteConnectingPhaseProgress(phase: RemoteConnectingPhase): number {
    return PHASE_DEFINITIONS[phase].progress
}

export function getRemoteConnectingPhaseStepKey(phase: RemoteConnectingPhase): string {
    return PHASE_DEFINITIONS[phase].stepKey
}

export function getRemoteConnectingFallbackPhase(): RemoteConnectingPhase {
    return 'opening-app'
}
