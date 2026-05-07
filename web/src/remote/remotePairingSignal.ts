import {
    PAIRING_CONNECT_TIMEOUT_MS,
    PAIRING_SIGNAL_FOREGROUND_JOIN_ACK_TIMEOUT_MS,
    PAIRING_SIGNAL_PING_INTERVAL_MS,
    PAIRING_SIGNAL_RECONNECT_DELAY_MS,
    type PairingIceServer,
    type PairingSignal,
} from '@viby/protocol'
import type { RemotePairingErrorKey } from './remotePairingErrors'

export const CONNECT_TIMEOUT_MS = PAIRING_CONNECT_TIMEOUT_MS
export const SIGNAL_RECONNECT_DELAY_MS = PAIRING_SIGNAL_RECONNECT_DELAY_MS
export const SIGNAL_PING_INTERVAL_MS = PAIRING_SIGNAL_PING_INTERVAL_MS
export const SIGNAL_FOREGROUND_JOIN_ACK_TIMEOUT_MS = PAIRING_SIGNAL_FOREGROUND_JOIN_ACK_TIMEOUT_MS

type RemotePeerConnectFailureKind = 'host-unavailable' | 'host-closed' | 'p2p-blocked' | 'closed' | 'expired' | 'socket'

type SignalPayload = {
    candidate?: RTCIceCandidateInit
}

export class RemotePeerConnectError extends Error {
    constructor(
        readonly kind: RemotePeerConnectFailureKind,
        readonly code: RemotePairingErrorKey
    ) {
        super(code)
        this.name = 'RemotePeerConnectError'
    }
}

export function getSignalPayload(value: unknown): SignalPayload | null {
    return value && typeof value === 'object' ? (value as SignalPayload) : null
}

export function serializeSignal(signal: Omit<PairingSignal, 'pairingId'>, pairingId: string): string {
    return JSON.stringify({ pairingId, ...signal })
}

export function hasRelayIceServer(iceServers: readonly PairingIceServer[]): boolean {
    return iceServers.some((server) => {
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
        return urls.some((url) => url.startsWith('turn:') || url.startsWith('turns:'))
    })
}

export function buildTimeoutError(hasOffer: boolean, hasRelay: boolean): RemotePeerConnectError {
    if (!hasOffer) {
        return new RemotePeerConnectError('host-unavailable', 'remotePairing.error.hostUnavailable')
    }

    return new RemotePeerConnectError(
        'p2p-blocked',
        hasRelay ? 'remotePairing.error.p2pTimedOut' : 'remotePairing.error.p2pBlocked'
    )
}
