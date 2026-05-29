import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { createPairingTunnelCipher, createPairingTunnelKeyFrame } from '@viby/protocol/pairing'
import type { DesktopPairingSession, HubRuntimeStatus, PairingBridgeState } from '@/types'
import { startPairingBridge } from './pairingBridgeController'

type Listener = (event?: { data: unknown }) => void

class FakeDataChannel {
    readyState: RTCDataChannelState = 'open'
    sent: string[] = []
    private readonly listeners = new Map<string, Listener[]>()
    addEventListener(type: string, listener: Listener): void {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
    }
    send(data: string): void {
        this.sent.push(data)
    }
    emit(type: string, data?: unknown): void {
        for (const listener of this.listeners.get(type) ?? []) listener({ data })
    }
    close(): void {
        this.readyState = 'closed'
        this.emit('close')
    }
}

class FakePeer {
    readonly channels: FakeDataChannel[] = []
    localCandidateType = 'host'
    remoteCandidateType = 'srflx'
    roundTripTime = 0.032
    restartCount = 0
    get channel(): FakeDataChannel {
        return this.channels[0]
    }
    signalingState = 'stable'
    localDescription = null
    iceConnectionState = 'new'
    connectionState = 'new'
    onicecandidate = null
    onconnectionstatechange: (() => void) | null = null
    oniceconnectionstatechange = null
    ondatachannel = null
    createDataChannel(): RTCDataChannel {
        const channel = new FakeDataChannel()
        this.channels.push(channel)
        return channel as unknown as RTCDataChannel
    }
    async createOffer() {
        return { type: 'offer' as const, sdp: 'offer' }
    }
    async createAnswer() {
        return { type: 'answer' as const, sdp: 'answer' }
    }
    async setLocalDescription(): Promise<void> {}
    async setRemoteDescription(): Promise<void> {}
    async addIceCandidate(): Promise<void> {}
    addEventListener(): void {}
    removeEventListener(): void {}
    restartIce(): void {
        this.restartCount += 1
    }
    close(): void {
        this.connectionState = 'closed'
    }
    async getStats(): Promise<RTCStatsReport> {
        return statsReport([
            { id: 'transport', type: 'transport', selectedCandidatePairId: 'pair' },
            {
                id: 'pair',
                type: 'candidate-pair',
                localCandidateId: 'local',
                remoteCandidateId: 'remote',
                currentRoundTripTime: this.roundTripTime,
            },
            { id: 'local', candidateType: this.localCandidateType },
            { id: 'remote', candidateType: this.remoteCandidateType },
        ]) as unknown as RTCStatsReport
    }
    connect(): void {
        this.connectionState = 'connected'
        this.onconnectionstatechange?.()
    }
}

class FakeSocket {
    static instances: FakeSocket[] = []
    readonly sent: string[] = []
    readyState = 0
    onopen: (() => void) | null = null
    onclose: (() => void) | null = null
    onerror = null
    onmessage: ((event: { data: unknown }) => void) | null = null
    send(data: string): void {
        this.sent.push(data)
    }
    emitMessage(data: unknown): void {
        this.onmessage?.({ data })
    }
    constructor(readonly url = '') {
        FakeSocket.instances.push(this)
    }
    open(): void {
        this.readyState = 1
        this.onopen?.()
    }
    close(): void {
        this.readyState = 3
        this.onclose?.()
    }
}

function statsReport(stats: Array<Record<string, unknown>>) {
    const byId = new Map(stats.map((stat) => [String(stat.id), stat]))
    return {
        get: (id: string) => byId.get(id),
        forEach: (callback: (stat: Record<string, unknown>) => void) => {
            for (const stat of stats) callback(stat)
        },
    }
}

function pairingSession(): DesktopPairingSession {
    return {
        pairing: {
            id: 'pairing-1',
            state: 'active',
            createdAt: 1,
            updatedAt: 2,
            expiresAt: 9_999,
            shortCode: null,
            approvalStatus: 'approved',
            host: {},
            guest: null,
        },
        hostToken: 'host-token',
        pairingUrl: 'https://example.test/p/pairing-1',
        wsUrl: 'wss://example.test/ws/pairing-1',
        tunnelUrl: 'wss://example.test/tunnel/pairing-1',
        iceServers: [],
    }
}

function hubReady(): HubRuntimeStatus {
    return {
        phase: 'ready',
        pid: 1,
        listenHost: '127.0.0.1',
        listenPort: 3000,
        localHubUrl: 'http://127.0.0.1:3000',
        preferredBrowserUrl: 'http://127.0.0.1:3000',
        publicUrl: '',
        publicAccessEnabled: false,
        hubOwnerToken: 'token',
        settingsFile: '/tmp/settings.json',
        dataDir: '/tmp/viby',
        startedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    }
}

describe('startPairingBridge', () => {
    const originalPeer = globalThis.RTCPeerConnection
    const originalSocket = globalThis.WebSocket
    let peer: FakePeer

    beforeEach(() => {
        peer = new FakePeer()
        FakeSocket.instances = []
        globalThis.RTCPeerConnection = function RTCPeerConnection() {
            return peer
        } as unknown as typeof RTCPeerConnection
        globalThis.WebSocket = function WebSocket(url: string | URL) {
            return new FakeSocket(String(url))
        } as unknown as typeof WebSocket
    })

    afterEach(() => {
        globalThis.RTCPeerConnection = originalPeer
        globalThis.WebSocket = originalSocket
    })

    it('requires direct heartbeat proof before reporting direct ready', async () => {
        const states: PairingBridgeState[] = []
        const cleanup = startPairingBridge({
            pairing: pairingSession(),
            getStatus: hubReady,
            onStateChange: (state) => states.push(state),
        })
        await Promise.resolve()
        peer.connect()
        expect(states.at(-1)?.phase).toBe('connecting')
        expect(states.at(-1)?.message).toBe('正在建立数据通道')
        peer.channel.emit('message', JSON.stringify({ kind: 'heartbeat' }))
        await Promise.resolve()
        expect(states.at(-1)?.phase).toBe('connecting')
        peer.channel.emit('message', JSON.stringify({ kind: 'heartbeat' }))
        await Promise.resolve()
        expect(states.at(-1)?.phase).toBe('ready')
        expect(states.at(-1)?.stats?.transport).toBe('direct')
        cleanup()
    })

    it('rebuilds direct transport when the browser guest is replaced by PWA handoff', async () => {
        const firstPeer = peer
        const secondPeer = new FakePeer()
        const peers = [firstPeer, secondPeer]
        globalThis.RTCPeerConnection = function RTCPeerConnection() {
            return peers.shift() ?? secondPeer
        } as unknown as typeof RTCPeerConnection
        const states: PairingBridgeState[] = []
        const cleanup = startPairingBridge({
            pairing: pairingSession(),
            getStatus: hubReady,
            onStateChange: (state) => states.push(state),
        })
        await Promise.resolve()
        firstPeer.connect()
        firstPeer.channel.emit('message', JSON.stringify({ kind: 'heartbeat' }))
        await Promise.resolve()
        firstPeer.channel.emit('message', JSON.stringify({ kind: 'heartbeat' }))
        await Promise.resolve()
        expect(states.at(-1)?.stats?.transportMode).toBe('direct-webrtc')

        FakeSocket.instances
            .find((socket) => socket.url.includes('/ws'))
            ?.emitMessage(JSON.stringify({ type: 'peer-replaced' }))
        await Promise.resolve()
        await Promise.resolve()

        expect(firstPeer.connectionState).toBe('closed')
        expect(firstPeer.channel.readyState).toBe('closed')
        expect(secondPeer.channels).toHaveLength(1)
        expect(states.at(-1)?.stats?.transportMode).not.toBe('direct-webrtc')

        secondPeer.connect()
        secondPeer.channel.emit('message', JSON.stringify({ kind: 'heartbeat' }))
        await Promise.resolve()
        secondPeer.channel.emit('message', JSON.stringify({ kind: 'heartbeat' }))
        await Promise.resolve()
        secondPeer.channel.emit('message', JSON.stringify({ kind: 'heartbeat' }))
        await Promise.resolve()
        expect(states.at(-1)?.stats?.transportMode).toBe('direct-webrtc')
        cleanup()
    })

    it('refreshes direct latency from the WebRTC stats ticker while the route stays direct', async () => {
        const originalSetInterval = globalThis.setInterval
        const originalClearInterval = globalThis.clearInterval
        let tick: (() => void) | null = null
        let cleared = false
        globalThis.setInterval = ((callback: TimerHandler) => {
            tick = () => {
                if (typeof callback === 'function') callback()
            }
            return 7 as unknown as ReturnType<typeof setInterval>
        }) as typeof setInterval
        globalThis.clearInterval = ((id: ReturnType<typeof setInterval>) => {
            if ((id as unknown as number) === 7) cleared = true
        }) as typeof clearInterval

        try {
            peer.roundTripTime = 0.005
            const states: PairingBridgeState[] = []
            const cleanup = startPairingBridge({
                pairing: pairingSession(),
                getStatus: hubReady,
                onStateChange: (state) => states.push(state),
            })
            await Promise.resolve()
            peer.connect()
            peer.channel.emit('message', JSON.stringify({ kind: 'heartbeat' }))
            await Promise.resolve()
            peer.channel.emit('message', JSON.stringify({ kind: 'heartbeat' }))
            await Promise.resolve()
            expect(states.at(-1)?.stats?.currentRoundTripTimeMs).toBe(5)

            peer.roundTripTime = 0.081
            tick?.()
            await Promise.resolve()
            await Promise.resolve()
            expect(states.at(-1)?.stats?.currentRoundTripTimeMs).toBe(81)

            cleanup()
            expect(cleared).toBe(true)
        } finally {
            globalThis.setInterval = originalSetInterval
            globalThis.clearInterval = originalClearInterval
        }
    })

    it('creates a replacement data channel when SCTP closes on a live peer', async () => {
        const states: PairingBridgeState[] = []
        const cleanup = startPairingBridge({
            pairing: pairingSession(),
            getStatus: hubReady,
            onStateChange: (state) => states.push(state),
        })
        await Promise.resolve()
        peer.connect()
        peer.channel.emit('message', JSON.stringify({ kind: 'heartbeat' }))
        await Promise.resolve()
        peer.channel.emit('message', JSON.stringify({ kind: 'heartbeat' }))
        await Promise.resolve()
        peer.channel.close()
        expect(peer.channels).toHaveLength(2)
        expect(states.at(-1)?.phase).toBe('connecting')
        peer.channels[1].emit('open')
        peer.channels[1].emit('message', JSON.stringify({ kind: 'heartbeat' }))
        await Promise.resolve()
        peer.channels[1].emit('message', JSON.stringify({ kind: 'heartbeat' }))
        await Promise.resolve()
        peer.channels[1].emit('message', JSON.stringify({ kind: 'heartbeat' }))
        await Promise.resolve()
        expect(states.at(-1)?.phase).toBe('ready')
        cleanup()
    })

    it('reprobes direct when relay becomes active after direct fallback', async () => {
        const states: PairingBridgeState[] = []
        const cleanup = startPairingBridge({
            pairing: pairingSession(),
            getStatus: hubReady,
            onStateChange: (state) => states.push(state),
        })
        await Promise.resolve()
        peer.connect()
        peer.channel.emit('message', JSON.stringify({ kind: 'heartbeat' }))
        await Promise.resolve()
        peer.channel.emit('message', JSON.stringify({ kind: 'heartbeat' }))
        await Promise.resolve()
        peer.channel.close()
        await pairRelaySocket(requireRelaySocket())
        await waitForCondition(() => peer.restartCount > 0 && peer.channels.length === 2)

        expect(peer.restartCount).toBeGreaterThan(0)
        expect(peer.channels).toHaveLength(2)
        cleanup()
    })

    it('rebuilds stale direct transport when PWA handoff happens after relay fallback', async () => {
        const firstPeer = peer
        const secondPeer = new FakePeer()
        const peers = [firstPeer, secondPeer]
        globalThis.RTCPeerConnection = function RTCPeerConnection() {
            return peers.shift() ?? secondPeer
        } as unknown as typeof RTCPeerConnection
        const cleanup = startPairingBridge({
            pairing: pairingSession(),
            getStatus: hubReady,
            onStateChange: () => {},
        })
        await Promise.resolve()
        firstPeer.channel.close()
        await pairRelaySocket(requireRelaySocket())

        requireSignalingSocket().emitMessage(JSON.stringify({ type: 'peer-replaced' }))
        await Promise.resolve()
        await Promise.resolve()

        expect(firstPeer.connectionState).toBe('closed')
        expect(secondPeer.channels).toHaveLength(1)
        cleanup()
    })

    it('stays connecting after the relay socket opens until the guest heartbeat acks', async () => {
        // `phase: 'ready'` now requires a real round-trip heartbeat ack so
        // the desktop UI cannot claim a phantom connection just because
        // the broker accepted the host tunnel socket. Pairing only goes
        // ready when the guest actually attached and bounced a frame back.
        globalThis.RTCPeerConnection = undefined as unknown as typeof RTCPeerConnection
        const states: PairingBridgeState[] = []
        const cleanup = startPairingBridge({
            pairing: pairingSession(),
            getStatus: () => null,
            onStateChange: (state) => states.push(state),
        })

        expect(states.at(-1)?.phase).toBe('connecting')
        await pairRelaySocket(FakeSocket.instances[0])
        // Allow microtasks to flush so any phantom `ready` would have already
        // landed here; the assertion locks down that it does not.
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(states.at(-1)?.phase).toBe('connecting')
        cleanup()
    })
})

async function pairRelaySocket(socket: FakeSocket): Promise<void> {
    socket.open()
    await waitForCondition(() => socket.sent.length > 0)
    const localKey = JSON.parse(socket.sent[0] ?? '{}') as { publicKey: string }
    const peerCipher = await createPairingTunnelCipher()
    await peerCipher.receivePeerKey(localKey.publicKey)
    const sentBeforePeerKey = socket.sent.length
    socket.emitMessage(
        JSON.stringify(createPairingTunnelKeyFrame({ id: 'peer-key', seq: 0, publicKey: peerCipher.publicKey }))
    )
    await waitForCondition(() => socket.sent.length > sentBeforePeerKey)
}

function requireRelaySocket(): FakeSocket {
    const socket = FakeSocket.instances.find((entry) => entry.url.includes('/tunnel'))
    if (!socket) throw new Error('relay socket missing')
    return socket
}

function requireSignalingSocket(): FakeSocket {
    const socket = FakeSocket.instances.find((entry) => entry.url.includes('/ws'))
    if (!socket) throw new Error('signaling socket missing')
    return socket
}

async function waitForCondition(predicate: () => boolean): Promise<void> {
    const deadline = Date.now() + 1_000
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error('condition timeout')
        await new Promise((resolve) => setTimeout(resolve, 0))
    }
}
