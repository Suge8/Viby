import { describe, expect, it } from 'bun:test'
import type { PairingSignalV2, PairingSignalV2Candidate, PairingSignalV2Description } from './pairingSignal'
import { createPerfectNegotiation, type RTCPeerConnection } from './perfectNegotiation'

type Description = PairingSignalV2Description['description']
type Candidate = PairingSignalV2Candidate['candidate']
type Listener = () => Promise<void>
type SignalingState = 'stable' | 'have-local-offer' | 'have-remote-offer' | 'closed'

class MockPeer {
    signalingState: SignalingState = 'stable'
    localDescription: Description | null = null
    remoteDescription: Description | null = null
    remoteDescriptions: Description[] = []
    candidates: Candidate[] = []
    failCandidate = false
    rejectCandidatesBeforeRemoteDescription = false
    private listeners = new Set<Listener>()
    private offerWaiter: (() => void) | null = null

    addEventListener(type: string, listener: Listener) {
        if (type === 'negotiationneeded') this.listeners.add(listener)
    }

    removeEventListener(type: string, listener: Listener) {
        if (type === 'negotiationneeded') this.listeners.delete(listener)
    }

    async triggerNegotiation() {
        await Promise.all([...this.listeners].map((listener) => listener()))
    }

    holdOffer() {
        return new Promise<void>((resolve) => {
            this.offerWaiter = resolve
        })
    }

    releaseOffer() {
        this.offerWaiter?.()
        this.offerWaiter = null
    }

    async createOffer(): Promise<Description> {
        if (this.offerWaiter)
            await new Promise<void>((resolve) => {
                const previous = this.offerWaiter
                this.offerWaiter = () => {
                    previous?.()
                    resolve()
                }
            })
        return { type: 'offer', sdp: 'local-offer' }
    }

    async createAnswer(): Promise<Description> {
        return { type: 'answer', sdp: 'local-answer' }
    }

    async setLocalDescription(description: Description) {
        this.localDescription = description
        this.signalingState = description.type === 'offer' ? 'have-local-offer' : 'stable'
    }

    async setRemoteDescription(description: Description) {
        this.remoteDescription = description
        this.remoteDescriptions.push(description)
        if (description.type === 'offer') this.signalingState = 'have-remote-offer'
        if (description.type === 'answer' || description.type === 'rollback') this.signalingState = 'stable'
    }

    async addIceCandidate(candidate: Candidate) {
        if (this.rejectCandidatesBeforeRemoteDescription && !this.remoteDescription) {
            const error = new Error('no remote description') as Error & { name?: string }
            error.name = 'InvalidStateError'
            throw error
        }
        if (this.failCandidate) throw new Error('candidate rejected')
        this.candidates.push(candidate)
    }
}

function createHarness(polite: boolean) {
    const peer = new MockPeer()
    const sent: PairingSignalV2[] = []
    const handle = createPerfectNegotiation({
        peer: peer as RTCPeerConnection,
        polite,
        send: (signal) => sent.push(signal),
    })
    return { handle, peer, sent }
}

describe('perfectNegotiation', () => {
    it('answers an initial offer on the polite side', async () => {
        const { handle, peer, sent } = createHarness(true)
        await handle.onSignal({ type: 'description', description: { type: 'offer', sdp: 'remote-offer' } })
        expect(peer.remoteDescription).toEqual({ type: 'offer', sdp: 'remote-offer' })
        expect(peer.localDescription).toEqual({ type: 'answer', sdp: 'local-answer' })
        expect(sent).toEqual([{ type: 'description', description: { type: 'answer', sdp: 'local-answer' } }])
    })

    it('creates an initial offer and accepts the answer', async () => {
        const { handle, peer, sent } = createHarness(false)
        await peer.triggerNegotiation()
        expect(peer.localDescription).toEqual({ type: 'offer', sdp: 'local-offer' })
        expect(sent).toEqual([{ type: 'description', description: { type: 'offer', sdp: 'local-offer' } }])
        await handle.onSignal({ type: 'description', description: { type: 'answer', sdp: 'remote-answer' } })
        expect(peer.remoteDescription).toEqual({ type: 'answer', sdp: 'remote-answer' })
    })

    it('handles glare on the polite side', async () => {
        const { handle, peer, sent } = createHarness(true)
        peer.holdOffer()
        const offerTask = peer.triggerNegotiation()
        await handle.onSignal({ type: 'description', description: { type: 'offer', sdp: 'remote-offer' } })
        peer.releaseOffer()
        await offerTask
        expect(peer.remoteDescription).toEqual({ type: 'offer', sdp: 'remote-offer' })
        expect(sent).toContainEqual({ type: 'description', description: { type: 'answer', sdp: 'local-answer' } })
    })

    it('ignores glare and its failing candidate on the impolite side', async () => {
        const { handle, peer } = createHarness(false)
        peer.holdOffer()
        const offerTask = peer.triggerNegotiation()
        await handle.onSignal({ type: 'description', description: { type: 'offer', sdp: 'remote-offer' } })
        peer.failCandidate = true
        await expect(
            handle.onSignal({ type: 'candidate', candidate: { candidate: 'late-candidate' } })
        ).resolves.toBeUndefined()
        peer.releaseOffer()
        await offerTask
        expect(peer.remoteDescriptions).toEqual([])
    })

    it('passes candidates to the peer before SDP', async () => {
        const { handle, peer } = createHarness(true)
        await handle.onSignal({ type: 'candidate', candidate: { candidate: 'early-candidate' } })
        expect(peer.candidates).toEqual([{ candidate: 'early-candidate' }])
    })

    it('retries candidates rejected until remote SDP is set', async () => {
        const { handle, peer } = createHarness(true)
        peer.rejectCandidatesBeforeRemoteDescription = true
        await expect(
            handle.onSignal({ type: 'candidate', candidate: { candidate: 'early-candidate' } })
        ).resolves.toBeUndefined()
        expect(peer.candidates).toEqual([])
        await handle.onSignal({ type: 'description', description: { type: 'offer', sdp: 'remote-offer' } })
        expect(peer.candidates).toEqual([{ candidate: 'early-candidate' }])
    })

    it('stops signal handling after dispose', async () => {
        const { handle, peer } = createHarness(true)
        handle.dispose()
        await peer.triggerNegotiation()
        await handle.onSignal({ type: 'description', description: { type: 'offer', sdp: 'remote-offer' } })
        expect(peer.remoteDescription).toBeNull()
        expect(peer.localDescription).toBeNull()
    })
})
