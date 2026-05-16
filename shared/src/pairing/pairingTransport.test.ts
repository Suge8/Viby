import { describe, expect, it } from 'bun:test'
import type { RtcIceCandidate, RtcSessionDescription } from './pairingSignal'
import { createPairingTransport, type PairingPeer, type PairingSocket, type RTCDataChannel } from './pairingTransport'

type SocketPair = { left: MockSocket; right: MockSocket }

class MockSocket implements PairingSocket {
    readyState = 0
    onopen: (() => void) | null = null
    onclose: (() => void) | null = null
    onerror: (() => void) | null = null
    onmessage: ((event: { data: string }) => void) | null = null
    sent: string[] = []
    peer: MockSocket | null = null
    closeCount = 0

    open() {
        this.readyState = 1
        this.onopen?.()
    }

    send(data: string) {
        this.sent.push(data)
        this.peer?.onmessage?.({ data })
    }

    close() {
        if (this.readyState === 3) return
        this.readyState = 3
        this.closeCount += 1
        this.onclose?.()
    }
}

class MockPeer implements PairingPeer {
    signalingState: PairingPeer['signalingState'] = 'stable'
    localDescription: RtcSessionDescription | null = null
    iceConnectionState = 'new'
    connectionState = 'new'
    onicecandidate: ((event: { candidate: RtcIceCandidate | null }) => void) | null = null
    onconnectionstatechange: (() => void) | null = null
    oniceconnectionstatechange: (() => void) | null = null
    ondatachannel: ((event: { channel: RTCDataChannel }) => void) | null = null
    restartCount = 0
    closeCount = 0
    createdChannels: RTCDataChannel[] = []

    async createOffer() {
        return { type: 'offer' as const, sdp: 'offer' }
    }
    async createAnswer() {
        return { type: 'answer' as const, sdp: 'answer' }
    }
    async setLocalDescription(description: RtcSessionDescription) {
        this.localDescription = description
        this.signalingState = description.type === 'offer' ? 'have-local-offer' : 'stable'
    }
    async setRemoteDescription(description: RtcSessionDescription) {
        this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable'
    }
    async addIceCandidate(_: RtcIceCandidate) {}
    addEventListener(_: 'negotiationneeded', listener: () => Promise<void>) {
        this.negotiation = listener
    }
    removeEventListener(_: 'negotiationneeded') {
        this.negotiation = null
    }
    negotiation: (() => Promise<void>) | null = null
    createDataChannel() {
        const channel = { readyState: 'open' }
        this.createdChannels.push(channel)
        return channel
    }
    restartIce() {
        this.restartCount += 1
        void this.negotiation?.()
    }
    close() {
        this.closeCount += 1
        this.connectionState = 'closed'
    }
    connect() {
        this.connectionState = 'connected'
        this.onconnectionstatechange?.()
    }
    failIce() {
        this.iceConnectionState = 'failed'
        this.oniceconnectionstatechange?.()
    }
    disconnectIce() {
        this.iceConnectionState = 'disconnected'
    }
    emitDataChannel(channel: RTCDataChannel) {
        this.ondatachannel?.({ channel })
    }
}

function socketPair(): SocketPair {
    const left = new MockSocket()
    const right = new MockSocket()
    left.peer = right
    right.peer = left
    return { left, right }
}

async function openWhenBound(socket: MockSocket) {
    await waitFor(() => expect(socket.onopen).toBeTruthy())
    socket.open()
}

function waitFor(assertion: () => void) {
    return new Promise<void>((resolve, reject) => {
        let tries = 0
        const tick = () => {
            try {
                assertion()
                resolve()
            } catch (error) {
                tries++ > 40 ? reject(error) : setTimeout(tick, 5)
            }
        }
        tick()
    })
}

describe('pairingTransport', () => {
    it('connects host and guest stores to ready', async () => {
        const sockets = socketPair(),
            hostPeer = new MockPeer(),
            guestPeer = new MockPeer()
        const hostEvents: unknown[] = [],
            guestEvents: unknown[] = []
        const host = createPairingTransport({
            pairingId: 'p',
            polite: false,
            iceServers: [],
            getWsUrl: async () => 'host',
            createDataChannel: true,
            onChannel: () => {},
            socketFactory: () => sockets.left,
            peerFactory: () => hostPeer,
        })
        const guest = createPairingTransport({
            pairingId: 'p',
            polite: true,
            iceServers: [],
            getWsUrl: async () => 'guest',
            createDataChannel: false,
            onChannel: () => {},
            socketFactory: () => sockets.right,
            peerFactory: () => guestPeer,
        })
        host.subscribe(() => hostEvents.push(host.getSnapshot()))
        guest.subscribe(() => guestEvents.push(guest.getSnapshot()))
        await openWhenBound(sockets.left)
        await openWhenBound(sockets.right)
        await hostPeer.negotiation?.()
        hostPeer.connect()
        guestPeer.connect()
        expect(host.getSnapshot().kind).toBe('ready')
        expect(guest.getSnapshot().kind).toBe('ready')
        expect(hostPeer.createdChannels).toHaveLength(1)
        expect(hostEvents.length).toBeGreaterThan(0)
        expect(guestEvents.length).toBeGreaterThan(0)
        host.dispose()
        guest.dispose()
    })

    it('keeps subscribe and getSnapshot compatible with external stores', () => {
        const socket = new MockSocket(),
            peer = new MockPeer(),
            transport = createPairingTransport({
                pairingId: 'p',
                polite: true,
                iceServers: [],
                getWsUrl: async () => 'u',
                createDataChannel: false,
                onChannel: () => {},
                socketFactory: () => socket,
                peerFactory: () => peer,
            })
        let calls = 0
        const first = transport.getSnapshot()
        const unsubscribe = transport.subscribe(() => calls++)
        expect(transport.getSnapshot()).toBe(first)
        peer.connect()
        expect(transport.getSnapshot()).not.toBe(first)
        unsubscribe()
        transport.dispose()
        expect(calls).toBe(1)
    })

    it('resolves one untilReady promise and rejects after dispose', async () => {
        const transport = createPairingTransport({
            pairingId: 'p',
            polite: true,
            iceServers: [],
            getWsUrl: async () => 'u',
            createDataChannel: false,
            onChannel: () => {},
            socketFactory: () => new MockSocket(),
            peerFactory: () => new MockPeer(),
        })
        const promise = transport.untilReady()
        expect(transport.untilReady()).toBe(promise)
        ;(transport.getPeer() as MockPeer).connect()
        await expect(promise).resolves.toBeUndefined()
        transport.dispose()
        await expect(transport.untilReady()).rejects.toThrow('closed')
    })

    it('reconnects with increasing attempts and wakes foreground sleep', async () => {
        const sockets = [new MockSocket(), new MockSocket(), new MockSocket()]
        let index = 0
        const transport = createPairingTransport({
            pairingId: 'p',
            polite: true,
            iceServers: [],
            getWsUrl: async () => `u${index}`,
            createDataChannel: false,
            onChannel: () => {},
            socketFactory: () => sockets[index++],
            peerFactory: () => new MockPeer(),
            randomJitter: () => 0,
        })
        await openWhenBound(sockets[0])
        sockets[0].close()
        await waitFor(() => expect(transport.getSnapshot()).toEqual({ kind: 'connecting', attempt: 1 }))
        transport.notifyForeground()
        await waitFor(() => expect(index).toBe(2))
        await openWhenBound(sockets[1])
        sockets[1].close()
        await waitFor(() => expect(transport.getSnapshot()).toEqual({ kind: 'connecting', attempt: 1 }))
        transport.dispose()
    })

    it('restarts ICE on socket close or failed ICE state', async () => {
        const socket = new MockSocket(),
            peer = new MockPeer()
        const transport = createPairingTransport({
            pairingId: 'p',
            polite: true,
            iceServers: [],
            getWsUrl: async () => 'u',
            createDataChannel: false,
            onChannel: () => {},
            socketFactory: () => socket,
            peerFactory: () => peer,
        })
        await openWhenBound(socket)
        peer.failIce()
        expect(peer.restartCount).toBe(1)
        socket.close()
        await waitFor(() => expect(transport.getSnapshot()).toEqual({ kind: 'connecting', attempt: 1 }))
        expect(peer.restartCount).toBe(1)
        transport.dispose()
    })

    it('handles foreground restart and noop cases', async () => {
        const socket = new MockSocket(),
            peer = new MockPeer()
        const transport = createPairingTransport({
            pairingId: 'p',
            polite: true,
            iceServers: [],
            getWsUrl: async () => 'u',
            createDataChannel: false,
            onChannel: () => {},
            socketFactory: () => socket,
            peerFactory: () => peer,
        })
        await openWhenBound(socket)
        peer.disconnectIce()
        transport.notifyForeground()
        expect(peer.restartCount).toBe(1)
        peer.iceConnectionState = 'connected'
        transport.notifyForeground()
        expect(peer.restartCount).toBe(1)
        expect(socket.closeCount).toBe(0)
        transport.dispose()
    })

    it('keeps ready state when the signaling socket reconnects', async () => {
        const sockets = [new MockSocket(), new MockSocket()]
        let index = 0
        const peer = new MockPeer()
        const transport = createPairingTransport({
            pairingId: 'p',
            polite: true,
            iceServers: [],
            getWsUrl: async () => `u${index}`,
            createDataChannel: false,
            onChannel: () => {},
            socketFactory: () => sockets[index++],
            peerFactory: () => peer,
            randomJitter: () => 0,
        })
        await openWhenBound(sockets[0])
        peer.connect()
        await waitFor(() => expect(transport.getSnapshot().kind).toBe('ready'))
        const states: unknown[] = []
        const unsubscribe = transport.subscribe(() => states.push(transport.getSnapshot()))
        sockets[0].close()
        await Promise.resolve()
        transport.notifyForeground()
        await waitFor(() => expect(index).toBe(2))
        await openWhenBound(sockets[1])
        expect(transport.getSnapshot().kind).toBe('ready')
        expect(states).toHaveLength(0)
        unsubscribe()
        transport.dispose()
    })

    it('buffers outgoing negotiation signals while the socket is down', async () => {
        const sockets = [new MockSocket(), new MockSocket()]
        let index = 0
        const peer = new MockPeer()
        const transport = createPairingTransport({
            pairingId: 'p',
            polite: true,
            iceServers: [],
            getWsUrl: async () => `u${index}`,
            createDataChannel: false,
            onChannel: () => {},
            socketFactory: () => sockets[index++],
            peerFactory: () => peer,
            randomJitter: () => 0,
        })
        await openWhenBound(sockets[0])
        peer.disconnectIce()
        sockets[0].close()
        await waitFor(() => expect(peer.localDescription).toEqual({ type: 'offer', sdp: 'offer' }))
        transport.notifyForeground()
        await waitFor(() => expect(index).toBe(2))
        await openWhenBound(sockets[1])
        expect(sockets[1].sent.map((payload) => JSON.parse(payload) as unknown)).toContainEqual({
            type: 'description',
            description: { type: 'offer', sdp: 'offer' },
        })
        transport.dispose()
    })

    it('turns broker bye into fatal and closes resources', async () => {
        const socket = new MockSocket(),
            peer = new MockPeer(),
            states: unknown[] = []
        const transport = createPairingTransport({
            pairingId: 'p',
            polite: true,
            iceServers: [],
            getWsUrl: async () => 'u',
            createDataChannel: false,
            onChannel: () => {},
            socketFactory: () => socket,
            peerFactory: () => peer,
        })
        transport.subscribe(() => states.push(transport.getSnapshot()))
        await openWhenBound(socket)
        socket.onmessage?.({ data: JSON.stringify({ type: 'bye', reason: 'pairing_unavailable' }) })
        await waitFor(() => expect(transport.getSnapshot()).toEqual({ kind: 'fatal', reason: 'pairing_unavailable' }))
        expect(peer.closeCount).toBe(1)
        expect(states).toHaveLength(1)
    })

    it('retries getWsUrl failures without fatal and bounds jitter', async () => {
        let calls = 0
        const transport = createPairingTransport({
            pairingId: 'p',
            polite: true,
            iceServers: [],
            getWsUrl: async () => {
                calls++
                throw new Error('down')
            },
            createDataChannel: false,
            onChannel: () => {},
            peerFactory: () => new MockPeer(),
            randomJitter: () => 0.15,
        })
        await waitFor(() => expect(transport.getSnapshot()).toEqual({ kind: 'connecting', attempt: 1 }))
        expect(calls).toBe(1)
        expect(300 * 2 * 1.15).toBe(690)
        transport.notifyForeground()
        await waitFor(() => expect(calls).toBe(2))
        transport.dispose()
    })

    it('uses datachannel events for guests', () => {
        const peer = new MockPeer(),
            channels: RTCDataChannel[] = []
        const transport = createPairingTransport({
            pairingId: 'p',
            polite: true,
            iceServers: [],
            getWsUrl: async () => 'u',
            createDataChannel: false,
            onChannel: (channel) => channels.push(channel),
            socketFactory: () => new MockSocket(),
            peerFactory: () => peer,
        })
        peer.emitDataChannel({ readyState: 'open' })
        expect(peer.createdChannels).toHaveLength(0)
        expect(channels).toHaveLength(1)
        transport.dispose()
    })
})
