export type RemoteConnectingPhase = 'pairing' | 'verify' | 'connecting' | 'finalizing'

type PhaseDefinition = {
    progress: number
    stepKey: string
    reconnectStepKey?: string
}

const PHASE_DEFINITIONS: Record<RemoteConnectingPhase, PhaseDefinition> = {
    pairing: {
        progress: 0.22,
        stepKey: 'remotePairing.connecting.phase.pairing',
    },
    verify: {
        progress: 0.5,
        stepKey: 'remotePairing.connecting.phase.verify',
    },
    connecting: {
        progress: 0.78,
        stepKey: 'remotePairing.connecting.phase.connecting',
        reconnectStepKey: 'remotePairing.reconnectNotice.phase.connecting',
    },
    finalizing: {
        progress: 0.96,
        stepKey: 'remotePairing.connecting.phase.finalizing',
        reconnectStepKey: 'remotePairing.reconnectNotice.phase.finalizing',
    },
}

export function getRemoteConnectingPhaseProgress(phase: RemoteConnectingPhase): number {
    return PHASE_DEFINITIONS[phase].progress
}

export function getRemoteConnectingPhaseStepKey(phase: RemoteConnectingPhase): string {
    return PHASE_DEFINITIONS[phase].stepKey
}

export function getRemoteReconnectPhaseStepKey(phase: RemoteConnectingPhase): string {
    return PHASE_DEFINITIONS[phase].reconnectStepKey ?? PHASE_DEFINITIONS[phase].stepKey
}

export function getRemoteConnectingFallbackPhase(reconnectAttempt: number): RemoteConnectingPhase {
    return reconnectAttempt > 0 ? 'connecting' : 'pairing'
}
