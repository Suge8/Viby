import type { RtcIceCandidate, RtcSessionDescription } from '../../../../shared/src/pairing/pairingSignal'
import type { PairingStatsReportLike } from '../../../../shared/src/pairing/pairingStats'
import type { PairingPeer, RTCDataChannel } from '../../../../shared/src/pairing/pairingTransport'
import { emptyStatsFixture } from './webkitStatsFixtures'

type NegotiationListener = () => Promise<void>
type FakeDataChannelState = 'connecting' | 'open' | 'closing' | 'closed'

export class FakeRtcDataChannel implements RTCDataChannel {
    readyState: FakeDataChannelState
    onopen: (() => void) | null = null
    onclose: (() => void) | null = null
    onmessage: ((event: { data: string }) => void) | null = null
    readonly sent: string[] = []
    peer: FakeRtcDataChannel | null = null

    constructor(readiness: FakeDataChannelState = 'connecting') {
        this.readyState = readiness
    }

    open(): void {
        if (this.readyState === 'open') return
        this.readyState = 'open'
        this.onopen?.()
    }

    send(data: string): void {
        if (this.readyState !== 'open') {
            const error = new Error('DataChannel is not open')
            error.name = 'InvalidStateError'
            throw error
        }
        this.sent.push(data)
        this.peer?.onmessage?.({ data })
    }

    close(): void {
        if (this.readyState === 'closed') return
        this.readyState = 'closed'
        this.onclose?.()
        if (this.peer?.readyState !== 'closed') this.peer?.close()
    }
}

export class FakeRtcPeer implements PairingPeer {
    signalingState: PairingPeer['signalingState'] = 'stable'
    localDescription: RtcSessionDescription | null = null
    remoteDescription: RtcSessionDescription | null = null
    iceConnectionState = 'new'
    connectionState = 'new'
    onicecandidate: ((event: { candidate: RtcIceCandidate | null }) => void) | null = null
    onconnectionstatechange: (() => void) | null = null
    oniceconnectionstatechange: (() => void) | null = null
    ondatachannel: ((event: { channel: RTCDataChannel }) => void) | null = null
    readonly createdChannels: FakeRtcDataChannel[] = []
    readonly receivedCandidates: RtcIceCandidate[] = []
    restartCount = 0
    closeCount = 0
    offerCount = 0
    answerCount = 0
    private readonly negotiationListeners = new Set<NegotiationListener>()
    private statsReport: PairingStatsReportLike = emptyStatsFixture()

    async createOffer(): Promise<RtcSessionDescription> {
        this.offerCount += 1
        return { type: 'offer', sdp: `fake-offer-${this.offerCount}` }
    }

    async createAnswer(): Promise<RtcSessionDescription> {
        this.answerCount += 1
        return { type: 'answer', sdp: `fake-answer-${this.answerCount}` }
    }

    async setLocalDescription(description: RtcSessionDescription): Promise<void> {
        this.localDescription = description
        this.signalingState = description.type === 'offer' ? 'have-local-offer' : 'stable'
    }

    async setRemoteDescription(description: RtcSessionDescription): Promise<void> {
        this.remoteDescription = description
        this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable'
    }

    async addIceCandidate(candidate: RtcIceCandidate): Promise<void> {
        this.receivedCandidates.push(candidate)
    }

    addEventListener(type: 'negotiationneeded', listener: NegotiationListener): void {
        if (type === 'negotiationneeded') this.negotiationListeners.add(listener)
    }

    removeEventListener(type: 'negotiationneeded', listener: NegotiationListener): void {
        if (type === 'negotiationneeded') this.negotiationListeners.delete(listener)
    }

    createDataChannel(_label: string, _options: { ordered: boolean }): RTCDataChannel {
        const channel = new FakeRtcDataChannel('connecting')
        this.createdChannels.push(channel)
        return channel
    }

    restartIce(): void {
        this.restartCount += 1
        void this.emitNegotiationNeeded()
    }

    close(): void {
        if (this.connectionState === 'closed') return
        this.closeCount += 1
        this.connectionState = 'closed'
        this.signalingState = 'closed'
        for (const channel of this.createdChannels) channel.close()
    }

    setStatsReport(report: PairingStatsReportLike): void {
        this.statsReport = report
    }

    async getStats(): Promise<PairingStatsReportLike> {
        return this.statsReport
    }

    async emitNegotiationNeeded(): Promise<void> {
        for (const listener of this.negotiationListeners) await listener()
    }

    emitIceCandidate(candidate: RtcIceCandidate | null): void {
        this.onicecandidate?.({ candidate })
    }

    setConnectionState(state: string): void {
        this.connectionState = state
        this.onconnectionstatechange?.()
    }

    setIceConnectionState(state: string): void {
        this.iceConnectionState = state
        this.oniceconnectionstatechange?.()
    }

    emitDataChannel(channel = new FakeRtcDataChannel('connecting')): FakeRtcDataChannel {
        this.ondatachannel?.({ channel })
        return channel
    }
}

export function createLinkedDataChannels(
    initialState: FakeDataChannelState = 'connecting'
): readonly [FakeRtcDataChannel, FakeRtcDataChannel] {
    const left = new FakeRtcDataChannel(initialState)
    const right = new FakeRtcDataChannel(initialState)
    left.peer = right
    right.peer = left
    return [left, right]
}
