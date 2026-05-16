import type { PairingSignalV2, PairingSignalV2Candidate, PairingSignalV2Description } from './pairingSignal'

type Description = PairingSignalV2Description['description']
type Candidate = PairingSignalV2Candidate['candidate']
type Listener = () => Promise<void>

export interface RTCPeerConnection {
    signalingState: 'stable' | 'have-local-offer' | 'have-remote-offer' | 'closed'
    localDescription: Description | null
    createOffer(): Promise<Description>
    createAnswer(): Promise<Description>
    setLocalDescription(description: Description): Promise<void>
    setRemoteDescription(description: Description): Promise<void>
    addIceCandidate(candidate: Candidate): Promise<void>
    addEventListener(type: 'negotiationneeded', listener: Listener): void
    removeEventListener(type: 'negotiationneeded', listener: Listener): void
}
export interface PerfectNegotiationOptions {
    peer: RTCPeerConnection
    polite: boolean
    send(signal: PairingSignalV2): void
}
export interface PerfectNegotiationHandle {
    onSignal(signal: PairingSignalV2): Promise<void>
    dispose(): void
}
export function createPerfectNegotiation(options: PerfectNegotiationOptions): PerfectNegotiationHandle {
    const { peer, polite, send } = options
    let active = true
    let makingOffer = false
    let ignoreOffer = false
    let isSettingRemoteAnswerPending = false
    const pendingCandidates: Candidate[] = []
    async function sendOffer() {
        try {
            makingOffer = true
            const offer = await peer.createOffer()
            if (!active || peer.signalingState !== 'stable') return
            await peer.setLocalDescription(offer)
            if (active && peer.localDescription) send({ type: 'description', description: peer.localDescription })
        } finally {
            makingOffer = false
        }
    }
    async function answerOffer() {
        const answer = await peer.createAnswer()
        if (!active) return
        await peer.setLocalDescription(answer)
        if (active && peer.localDescription) send({ type: 'description', description: peer.localDescription })
    }
    async function flushPendingCandidates(): Promise<void> {
        if (!active || pendingCandidates.length === 0) return
        const candidates = pendingCandidates.splice(0, pendingCandidates.length)
        for (let index = 0; index < candidates.length; index++) {
            const candidate = candidates[index]
            try {
                await peer.addIceCandidate(candidate)
            } catch (error) {
                if (isInvalidStateError(error)) {
                    pendingCandidates.unshift(...candidates.slice(index))
                    return
                }
                throw error
            }
        }
    }
    async function onDescription(description: Description) {
        const readyForOffer = !makingOffer && (peer.signalingState === 'stable' || isSettingRemoteAnswerPending)
        const offerCollision = description.type === 'offer' && !readyForOffer
        ignoreOffer = !polite && offerCollision
        if (ignoreOffer) return
        isSettingRemoteAnswerPending = description.type === 'answer'
        try {
            await peer.setRemoteDescription(description)
        } finally {
            isSettingRemoteAnswerPending = false
        }
        await flushPendingCandidates()
        if (active && description.type === 'offer') await answerOffer()
    }
    async function onSignal(signal: PairingSignalV2) {
        if (!active || signal.type === 'bye') return
        if (signal.type === 'description') return onDescription(signal.description)
        try {
            await peer.addIceCandidate(signal.candidate)
        } catch (error) {
            if (ignoreOffer) return
            if (isInvalidStateError(error)) {
                pendingCandidates.push(signal.candidate)
                return
            }
            throw error
        }
    }
    peer.addEventListener('negotiationneeded', sendOffer)
    return {
        onSignal,
        dispose: () => {
            active = false
            pendingCandidates.length = 0
            peer.removeEventListener('negotiationneeded', sendOffer)
        },
    }
}

function isInvalidStateError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'InvalidStateError'
}
