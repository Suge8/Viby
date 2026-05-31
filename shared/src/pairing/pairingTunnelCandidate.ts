import type { PairingTunnelCandidateType } from './pairingTunnelFrame'
import type { PairingTunnelObservedTransport } from './pairingTunnelRouteTypes'

export function resolvePairingTunnelDirectCandidateType(input: {
    localCandidateType?: string | null
    remoteCandidateType?: string | null
    transport: PairingTunnelObservedTransport
}): PairingTunnelCandidateType | null {
    if (input.transport === 'relay') return 'relay'
    if (input.transport !== 'direct') return null
    return (
        normalizeCandidateType(input.localCandidateType) ?? normalizeCandidateType(input.remoteCandidateType) ?? 'srflx'
    )
}

function normalizeCandidateType(value: string | null | undefined): PairingTunnelCandidateType | null {
    return value === 'host' || value === 'srflx' || value === 'prflx' || value === 'relay' ? value : null
}
