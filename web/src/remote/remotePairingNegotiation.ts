import type { PairingSignal } from '@viby/protocol'
import { getSignalPayload } from './remotePairingSignal'
import { readPeerSignalingState } from './remotePairingTransportSupport'

type NegotiationOptions = {
    peer: RTCPeerConnection
    sendSignal: (signal: Omit<PairingSignal, 'pairingId'>) => void
}

export function createRemotePairingNegotiation(options: NegotiationOptions) {
    const pendingRemoteCandidates: RTCIceCandidateInit[] = []

    async function addRemoteCandidate(candidate: RTCIceCandidateInit): Promise<void> {
        if (!options.peer.remoteDescription) {
            pendingRemoteCandidates.push(candidate)
            return
        }
        await options.peer.addIceCandidate(candidate)
    }

    async function flushRemoteCandidates(): Promise<void> {
        while (pendingRemoteCandidates.length > 0 && options.peer.remoteDescription) {
            const candidate = pendingRemoteCandidates.shift()
            if (candidate) await options.peer.addIceCandidate(candidate)
        }
    }

    async function answerOffer(payload: unknown): Promise<void> {
        if (readPeerSignalingState(options.peer) !== 'stable') return
        await options.peer.setRemoteDescription(payload as RTCSessionDescriptionInit)
        await flushRemoteCandidates()
        const answer = await options.peer.createAnswer()
        if (readPeerSignalingState(options.peer) !== 'have-remote-offer') return
        await options.peer.setLocalDescription(answer)
        options.sendSignal({ type: 'answer', to: 'host', payload: answer })
    }

    async function addCandidatePayload(payload: unknown): Promise<void> {
        const signalPayload = getSignalPayload(payload)
        const candidate = signalPayload?.candidate ?? (payload as RTCIceCandidateInit | undefined)
        if (candidate) await addRemoteCandidate(candidate)
    }

    return { addCandidatePayload, answerOffer }
}
