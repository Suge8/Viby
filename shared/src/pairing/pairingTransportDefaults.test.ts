import { afterEach, describe, expect, it } from 'bun:test'
import type { RtcIceCandidate, RtcSessionDescription } from './pairingSignal'
import { createPairingTransport, type PairingPeer, type PairingSocket, type RTCDataChannel } from './pairingTransport'

type PeerConstructor = new (config: unknown) => PairingPeer
type BrowserGlobal = { RTCPeerConnection?: PeerConstructor }

const browserGlobal = globalThis as unknown as BrowserGlobal
const originalPeerConnection = browserGlobal.RTCPeerConnection

class DefaultPeer implements PairingPeer {
    signalingState: PairingPeer['signalingState'] = 'stable'
    localDescription: RtcSessionDescription | null = null
    iceConnectionState = 'new'
    connectionState = 'new'
    onicecandidate: ((event: { candidate: RtcIceCandidate | null }) => void) | null = null
    onconnectionstatechange: (() => void) | null = null
    oniceconnectionstatechange: (() => void) | null = null
    ondatachannel: ((event: { channel: RTCDataChannel }) => void) | null = null

    async createOffer() {
        return { type: 'offer' as const, sdp: 'offer' }
    }
    async createAnswer() {
        return { type: 'answer' as const, sdp: 'answer' }
    }
    async setLocalDescription(description: RtcSessionDescription) {
        this.localDescription = description
    }
    async setRemoteDescription(_: RtcSessionDescription) {}
    async addIceCandidate(_: RtcIceCandidate) {}
    addEventListener(_: 'negotiationneeded', __: () => Promise<void>) {}
    removeEventListener(_: 'negotiationneeded') {}
    createDataChannel() {
        return { readyState: 'open' }
    }
    restartIce() {}
    close() {
        this.connectionState = 'closed'
    }
}

class DefaultSocket implements PairingSocket {
    readyState = 0
    onopen: (() => void) | null = null
    onclose: (() => void) | null = null
    onerror: (() => void) | null = null
    onmessage: ((event: { data: string }) => void) | null = null
    send(_: string) {}
    close() {}
}

describe('pairingTransport default peer', () => {
    afterEach(() => {
        if (originalPeerConnection) browserGlobal.RTCPeerConnection = originalPeerConnection
        else delete browserGlobal.RTCPeerConnection
    })

    it('pre-gathers ICE candidates on the browser peer', () => {
        const configs: unknown[] = []
        browserGlobal.RTCPeerConnection = class MockPeer extends DefaultPeer {
            constructor(config: unknown) {
                super()
                configs.push(config)
            }
        }
        const transport = createPairingTransport({
            pairingId: 'p',
            polite: true,
            iceServers: [{ urls: 'stun:stun.example.test' }],
            getWsUrl: async () => 'wss://pair.example/ws',
            createDataChannel: true,
            onChannel: () => {},
            socketFactory: () => new DefaultSocket(),
        })
        transport.dispose()
        expect(configs).toEqual([
            {
                bundlePolicy: 'max-bundle',
                iceCandidatePoolSize: 4,
                iceServers: [{ urls: 'stun:stun.example.test' }],
            },
        ])
    })
})
