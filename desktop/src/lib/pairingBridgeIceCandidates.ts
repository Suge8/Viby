export function createPairingBridgeRemoteCandidateQueue() {
    const pending: RTCIceCandidateInit[] = []

    async function add(peer: RTCPeerConnection, candidate: RTCIceCandidateInit): Promise<void> {
        if (!peer.remoteDescription) {
            pending.push(candidate)
            return
        }
        await peer.addIceCandidate(candidate)
    }

    async function flush(peer: RTCPeerConnection): Promise<void> {
        while (pending.length > 0 && peer.remoteDescription) {
            const candidate = pending.shift()
            if (candidate) await peer.addIceCandidate(candidate)
        }
    }

    function clear(): void {
        pending.splice(0)
    }

    return { add, flush, clear }
}
