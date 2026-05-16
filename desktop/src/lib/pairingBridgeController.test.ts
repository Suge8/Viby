import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
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
    restartIce(): void {}
    close(): void {
        this.connectionState = 'closed'
    }
    async getStats(): Promise<RTCStatsReport> {
        return new Map() as unknown as RTCStatsReport
    }
    connect(): void {
        this.connectionState = 'connected'
        this.onconnectionstatechange?.()
    }
}

class FakeSocket {
    readyState = 0
    onopen: (() => void) | null = null
    onclose: (() => void) | null = null
    onerror = null
    onmessage = null
    send(): void {}
    close(): void {
        this.readyState = 3
        this.onclose?.()
    }
}

function pairingSession(): DesktopPairingSession {
    return {
        pairing: {
            id: 'pairing-1',
            state: 'connected',
            createdAt: 1,
            updatedAt: 2,
            expiresAt: 9_999,
            ticketExpiresAt: 9_999,
            shortCode: null,
            approvalStatus: 'approved',
            host: {},
            guest: null,
        },
        hostToken: 'host-token',
        pairingUrl: 'https://example.test/p/pairing-1',
        wsUrl: 'wss://example.test/ws/pairing-1',
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
        cliApiToken: 'token',
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
        globalThis.RTCPeerConnection = function RTCPeerConnection() {
            return peer
        } as unknown as typeof RTCPeerConnection
        globalThis.WebSocket = function WebSocket() {
            return new FakeSocket()
        } as unknown as typeof WebSocket
    })

    afterEach(() => {
        globalThis.RTCPeerConnection = originalPeer
        globalThis.WebSocket = originalSocket
    })

    it('requires channel activity before reporting the bridge ready', async () => {
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
        expect(states.at(-1)?.phase).toBe('ready')
        cleanup()
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
        peer.channel.close()
        expect(peer.channels).toHaveLength(2)
        expect(states.at(-1)?.phase).toBe('connecting')
        peer.channels[1].emit('open')
        peer.channels[1].emit('message', JSON.stringify({ kind: 'heartbeat' }))
        expect(states.at(-1)?.phase).toBe('ready')
        cleanup()
    })
})
