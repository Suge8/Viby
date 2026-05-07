import { describe, expect, it, mock } from 'bun:test'
import { createPairingBridgeRemoteCandidateQueue } from './pairingBridgeIceCandidates'

function createPeer() {
    return {
        remoteDescription: null as RTCSessionDescriptionInit | null,
        addIceCandidate: mock(async () => undefined),
    } as unknown as RTCPeerConnection & {
        remoteDescription: RTCSessionDescriptionInit | null
        addIceCandidate: ReturnType<typeof mock>
    }
}

describe('pairingBridgeIceCandidates', () => {
    it('queues remote ICE candidates until the answer is applied', async () => {
        const queue = createPairingBridgeRemoteCandidateQueue()
        const peer = createPeer()
        const candidate = { candidate: 'candidate-1' }

        await queue.add(peer, candidate)
        expect(peer.addIceCandidate).not.toHaveBeenCalled()

        peer.remoteDescription = { type: 'answer', sdp: 'answer-sdp' }
        await queue.flush(peer)

        expect(peer.addIceCandidate).toHaveBeenCalledWith(candidate)
    })

    it('clears stale candidates when a transport is rebuilt', async () => {
        const queue = createPairingBridgeRemoteCandidateQueue()
        const peer = createPeer()

        await queue.add(peer, { candidate: 'old-candidate' })
        queue.clear()
        peer.remoteDescription = { type: 'answer', sdp: 'answer-sdp' }
        await queue.flush(peer)

        expect(peer.addIceCandidate).not.toHaveBeenCalled()
    })
})
