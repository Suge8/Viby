export function readPeerSignalingState(peer: RTCPeerConnection): RTCSignalingState {
    return peer.signalingState
}

export function createRemoteTransportId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function buildTransportSocketUrl(wsUrl: string, transportId: string): string {
    const url = new URL(wsUrl)
    url.searchParams.set('transportId', transportId)
    return url.toString()
}
