import { describe, expect, it } from 'bun:test'
import { resolvePairingSelectedCandidatePairStats } from '../../../../shared/src/pairing/pairingStats'
import { createLinkedDataChannels, FakeRtcPeer } from './fakeRtcPeer'
import { chromiumDirectStatsFixture, relaySelectedStatsFixture, webkitDirectStatsFixture } from './webkitStatsFixtures'

describe('FakeRtcPeer', () => {
    it('runs negotiationneeded listeners and records local descriptions', async () => {
        const peer = new FakeRtcPeer()
        const descriptions: unknown[] = []
        peer.addEventListener('negotiationneeded', async () => {
            const offer = await peer.createOffer()
            await peer.setLocalDescription(offer)
            descriptions.push(peer.localDescription)
        })
        await peer.emitNegotiationNeeded()
        expect(descriptions).toEqual([{ type: 'offer', sdp: 'fake-offer-1' }])
        expect(peer.signalingState).toBe('have-local-offer')
    })

    it('surfaces ICE restart and state transitions through PairingPeer callbacks', () => {
        const peer = new FakeRtcPeer()
        const connectionStates: string[] = []
        const iceStates: string[] = []
        peer.onconnectionstatechange = () => connectionStates.push(peer.connectionState)
        peer.oniceconnectionstatechange = () => iceStates.push(peer.iceConnectionState)
        peer.restartIce()
        peer.setConnectionState('connected')
        peer.setIceConnectionState('disconnected')
        expect(peer.restartCount).toBe(1)
        expect(connectionStates).toEqual(['connected'])
        expect(iceStates).toEqual(['disconnected'])
    })

    it('creates linked data channels that throw on mid-send closed state', () => {
        const [left, right] = createLinkedDataChannels('open')
        const received: string[] = []
        right.onmessage = (event) => received.push(event.data)
        left.send('rpc')
        expect(received).toEqual(['rpc'])
        left.close()
        expect(() => left.send('late')).toThrow('DataChannel is not open')
    })

    it('returns scriptable Chromium, WebKit, and relay stats reports', async () => {
        const peer = new FakeRtcPeer()
        peer.setStatsReport(chromiumDirectStatsFixture())
        expect(resolvePairingSelectedCandidatePairStats(await peer.getStats())?.localCandidateType).toBe('host')
        peer.setStatsReport(webkitDirectStatsFixture())
        expect(resolvePairingSelectedCandidatePairStats(await peer.getStats())?.localCandidateType).toBe('srflx')
        peer.setStatsReport(relaySelectedStatsFixture())
        expect(resolvePairingSelectedCandidatePairStats(await peer.getStats())?.localCandidateType).toBe('relay')
    })
})
