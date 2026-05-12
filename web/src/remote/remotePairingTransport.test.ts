import {
    PAIRING_CONNECT_TIMEOUT_MS,
    PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS,
    PAIRING_PEER_HEARTBEAT_INTERVAL_MS,
} from '@viby/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetBrowserLifecycleForTests } from '@/lib/browserLifecycle'
import { resetForegroundPulseForTests } from '@/lib/foregroundPulse'
import { PEER_DISCONNECTED_GRACE_MS } from './remotePairingPeerDisconnect'
import { PEER_REQUEST_TIMEOUT_MS } from './remotePairingPendingRequests'
import { RemotePeerConnectError } from './remotePairingSignal'
import { connectRemotePeer } from './remotePairingTransport'
import {
    FakeDataChannel,
    FakePeerConnection,
    FakeWebSocket,
    resetFakeRemoteTransport,
} from './remotePairingTransportTestHarness'

const CONNECT_TIMEOUT_MS = PAIRING_CONNECT_TIMEOUT_MS
const SIGNAL_RECONNECT_DELAY_MS = 1_000

function readJoinTransportId(socket: FakeWebSocket | undefined): string | null {
    const join = socket?.sent
        .map((payload) => JSON.parse(payload) as { type?: string; payload?: { transportId?: string } })
        .find((payload) => payload.type === 'join')
    return join?.payload?.transportId ?? null
}

function readSocketTransportId(socket: FakeWebSocket | undefined): string | null {
    return socket ? new URL(socket.url).searchParams.get('transportId') : null
}

function connect(): Promise<unknown> {
    return connectRemotePeer({ pairingId: 'pairing-1', wsUrl: 'wss://pair.example/ws', iceServers: [] })
}

beforeEach(() => {
    vi.useFakeTimers()
    resetFakeRemoteTransport()
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection)
})

afterEach(() => {
    resetForegroundPulseForTests()
    resetBrowserLifecycleForTests()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('remotePairingTransport', () => {
    it('distinguishes an unresponsive desktop from a P2P-blocked network', async () => {
        const pending = connect().catch((error: unknown) => error)

        await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS)

        await expect(pending).resolves.toMatchObject({
            name: 'RemotePeerConnectError',
            kind: 'host-unavailable',
            code: 'remotePairing.error.hostUnavailable',
        })
    })

    it('reports a network block when signaling works but the data channel never opens', async () => {
        const pending = connect().catch((error: unknown) => error)
        FakeWebSocket.instances[0]?.open()
        FakeWebSocket.instances[0]?.receive({
            pairingId: 'pairing-1',
            type: 'offer',
            payload: { type: 'offer', sdp: 'offer-sdp' },
        })

        await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS)

        await expect(pending).resolves.toBeInstanceOf(RemotePeerConnectError)
        await expect(pending).resolves.toHaveProperty('kind', 'p2p-blocked')
    })

    it('rejects the initial connection when signaling offer handling fails', async () => {
        const pending = connect().catch((error: unknown) => error)
        FakeWebSocket.instances[0]?.open()
        if (FakePeerConnection.instance) {
            FakePeerConnection.instance.setRemoteDescription = async () => {
                throw new Error('bad offer')
            }
        }

        FakeWebSocket.instances[0]?.receive({
            pairingId: 'pairing-1',
            type: 'offer',
            payload: { type: 'offer', sdp: 'offer-sdp' },
        })

        await expect(pending).resolves.toMatchObject({ message: 'bad offer' })
    })

    it('uses neutral timeout copy when TURN relay fallback is configured', async () => {
        const pending = connectRemotePeer({
            pairingId: 'pairing-1',
            wsUrl: 'wss://pair.example/ws',
            iceServers: [{ urls: ['stun:turn.example.com:3478', 'turn:turn.example.com:3478?transport=udp'] }],
        }).catch((error: unknown) => error)
        FakeWebSocket.instances[0]?.open()
        FakeWebSocket.instances[0]?.receive({
            pairingId: 'pairing-1',
            type: 'offer',
            payload: { type: 'offer', sdp: 'offer-sdp' },
        })

        await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS)

        await expect(pending).resolves.toMatchObject({
            kind: 'p2p-blocked',
            code: 'remotePairing.error.p2pTimedOut',
        })
    })

    it('rejoins signaling with the same transport id after the data channel is ready', async () => {
        const pending = connect()
        const firstSocket = FakeWebSocket.instances[0]
        firstSocket?.open()
        const channel = new FakeDataChannel()
        FakePeerConnection.instance?.attachChannel(channel)
        channel.open()

        await expect(pending).resolves.toBeTruthy()
        const firstTransportId = readSocketTransportId(firstSocket)
        firstSocket?.close()
        await vi.advanceTimersByTimeAsync(SIGNAL_RECONNECT_DELAY_MS)
        const secondSocket = FakeWebSocket.instances[1]
        secondSocket?.open()

        expect(firstTransportId).toBeTruthy()
        expect(readJoinTransportId(firstSocket)).toBe(firstTransportId)
        expect(readSocketTransportId(secondSocket)).toBe(firstTransportId)
        expect(readJoinTransportId(secondSocket)).toBe(firstTransportId)
    })

    it('ignores stale signaling messages after a replacement socket opens', async () => {
        const pending = connect()
        const firstSocket = FakeWebSocket.instances[0]
        firstSocket?.open()
        const channel = new FakeDataChannel()
        FakePeerConnection.instance?.attachChannel(channel)
        channel.open()

        await expect(pending).resolves.toBeTruthy()
        firstSocket?.close()
        await vi.advanceTimersByTimeAsync(SIGNAL_RECONNECT_DELAY_MS)
        FakeWebSocket.instances[1]?.open()
        firstSocket?.receive({ pairingId: 'pairing-1', type: 'offer', payload: { type: 'offer', sdp: 'stale' } })
        await Promise.resolve()

        expect(firstSocket?.sent.some((payload) => payload.includes('"type":"answer"'))).toBe(false)
    })

    it('notifies the controller immediately on page wake when the channel is stale', async () => {
        const pending = connectRemotePeer({ pairingId: 'pairing-1', wsUrl: 'wss://pair.example/ws', iceServers: [] })
        FakeWebSocket.instances[0]?.open()
        const channel = new FakeDataChannel()
        FakePeerConnection.instance?.attachChannel(channel)
        channel.open()
        const bridge = await pending
        const onClose = vi.fn()

        bridge.onClose(onClose)
        channel.readyState = 'closed'
        document.dispatchEvent(new Event('visibilitychange'))

        expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ code: 'remotePairing.error.closedRetrying' }))
    })

    it('ignores stale offers that arrive after mobile wake in a non-stable signaling state', async () => {
        const pending = connectRemotePeer({ pairingId: 'pairing-1', wsUrl: 'wss://pair.example/ws', iceServers: [] })
        FakeWebSocket.instances[0]?.open()
        const channel = new FakeDataChannel()
        FakePeerConnection.instance?.attachChannel(channel)
        channel.open()
        const bridge = await pending
        const onClose = vi.fn()
        bridge.onClose(onClose)

        if (FakePeerConnection.instance) {
            FakePeerConnection.instance.signalingState = 'have-remote-offer'
        }
        FakeWebSocket.instances[0]?.receive({
            pairingId: 'pairing-1',
            type: 'offer',
            payload: { type: 'offer', sdp: 'stale-offer-sdp' },
        })
        await Promise.resolve()

        expect(onClose).not.toHaveBeenCalled()
        expect(FakeWebSocket.instances[0]?.sent.some((payload) => payload.includes('"type":"answer"'))).toBe(false)
    })

    it('schedules disconnect grace when the ready data channel closes', async () => {
        const pending = connectRemotePeer({ pairingId: 'pairing-1', wsUrl: 'wss://pair.example/ws', iceServers: [] })
        FakeWebSocket.instances[0]?.open()
        const channel = new FakeDataChannel()
        FakePeerConnection.instance?.attachChannel(channel)
        channel.open()
        const bridge = await pending
        const onClose = vi.fn()

        bridge.onClose(onClose)
        channel.close()

        expect(onClose).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(PEER_DISCONNECTED_GRACE_MS)

        expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ code: 'remotePairing.error.closedRetrying' }))
    })

    it('emits close immediately when peer connection is already closed', async () => {
        const pending = connectRemotePeer({ pairingId: 'pairing-1', wsUrl: 'wss://pair.example/ws', iceServers: [] })
        FakeWebSocket.instances[0]?.open()
        const channel = new FakeDataChannel()
        FakePeerConnection.instance?.attachChannel(channel)
        channel.open()
        const bridge = await pending
        const onClose = vi.fn()

        bridge.onClose(onClose)
        if (FakePeerConnection.instance) {
            FakePeerConnection.instance.connectionState = 'closed'
        }
        channel.close()

        expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ code: 'remotePairing.error.closedRetrying' }))
    })

    it('times out an unanswered peer RPC and clears it before late responses arrive', async () => {
        const pending = connectRemotePeer({ pairingId: 'pairing-1', wsUrl: 'wss://pair.example/ws', iceServers: [] })
        FakeWebSocket.instances[0]?.open()
        const channel = new FakeDataChannel()
        FakePeerConnection.instance?.attachChannel(channel)
        channel.open()
        const bridge = await pending
        const onClose = vi.fn()
        bridge.onClose(onClose)

        const listRequest = bridge.listSessions().catch((error: unknown) => error)
        channel.emit('message', new MessageEvent('message', { data: JSON.stringify({ kind: 'heartbeat' }) }))
        await vi.advanceTimersByTimeAsync(PAIRING_PEER_HEARTBEAT_INTERVAL_MS)
        channel.emit('message', new MessageEvent('message', { data: JSON.stringify({ kind: 'heartbeat' }) }))
        await vi.advanceTimersByTimeAsync(PEER_REQUEST_TIMEOUT_MS - PAIRING_PEER_HEARTBEAT_INTERVAL_MS)

        await expect(listRequest).resolves.toMatchObject({ code: 'remotePairing.error.peerTimeout' })
        expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ code: 'remotePairing.error.closedRetrying' }))

        const sent = JSON.parse(channel.sent.find((payload) => payload.includes('"kind":"request"')) ?? '{}') as {
            id?: string
        }
        channel.emit(
            'message',
            new MessageEvent('message', {
                data: JSON.stringify({
                    kind: 'response',
                    id: sent.id,
                    ok: true,
                    result: { sessions: [] },
                }),
            })
        )

        const nonHeartbeatSent = channel.sent.filter((payload) => !payload.includes('"heartbeat"'))
        expect(nonHeartbeatSent).toHaveLength(1)
    })

    it('probes before peer RPC so a stale ready bridge reconnects before the request timeout', async () => {
        const pending = connectRemotePeer({ pairingId: 'pairing-1', wsUrl: 'wss://pair.example/ws', iceServers: [] })
        FakeWebSocket.instances[0]?.open()
        const channel = new FakeDataChannel()
        FakePeerConnection.instance?.attachChannel(channel)
        channel.open()
        const bridge = await pending
        const onClose = vi.fn()
        bridge.onClose(onClose)

        const request = bridge.listSessions().catch((error: unknown) => error)
        await vi.advanceTimersByTimeAsync(PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS + 1)

        await expect(request).resolves.toMatchObject({ code: 'remotePairing.error.closedRetrying' })
        expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ code: 'remotePairing.error.closedRetrying' }))
    })

    it('clears peer RPC pending state when DataChannel send throws', async () => {
        const pending = connectRemotePeer({ pairingId: 'pairing-1', wsUrl: 'wss://pair.example/ws', iceServers: [] })
        FakeWebSocket.instances[0]?.open()
        const channel = new FakeDataChannel()
        FakePeerConnection.instance?.attachChannel(channel)
        channel.open()
        const bridge = await pending
        const onClose = vi.fn()
        bridge.onClose(onClose)
        channel.sendError = new Error('send failed')

        const request = bridge.listSessions().catch((error: unknown) => error)
        await vi.advanceTimersByTimeAsync(PEER_REQUEST_TIMEOUT_MS)

        await expect(request).resolves.toMatchObject({ message: 'send failed' })
        expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ code: 'remotePairing.error.closedRetrying' }))
    })

    it('rejects the initial bridge when the health probe cannot be sent', async () => {
        const pending = connectRemotePeer({
            pairingId: 'pairing-1',
            wsUrl: 'wss://pair.example/ws',
            iceServers: [],
        }).catch((error: unknown) => error)
        FakeWebSocket.instances[0]?.open()
        const channel = new FakeDataChannel()
        FakePeerConnection.instance?.attachChannel(channel)
        channel.sendError = new Error('probe failed')

        channel.open()

        await expect(pending).resolves.toMatchObject({ code: 'remotePairing.error.closedRetrying' })
    })

    it('keeps a disconnected WebRTC peer alive through the recovery grace window', async () => {
        const pending = connectRemotePeer({ pairingId: 'pairing-1', wsUrl: 'wss://pair.example/ws', iceServers: [] })
        FakeWebSocket.instances[0]?.open()
        const channel = new FakeDataChannel()
        FakePeerConnection.instance?.attachChannel(channel)
        channel.open()
        const bridge = await pending
        const onClose = vi.fn()

        bridge.onClose(onClose)
        channel.emit('message', new MessageEvent('message', { data: JSON.stringify({ kind: 'heartbeat' }) }))
        FakePeerConnection.instance?.setConnectionState('disconnected')
        await vi.advanceTimersByTimeAsync(PEER_DISCONNECTED_GRACE_MS - 1)

        expect(onClose).not.toHaveBeenCalled()

        FakePeerConnection.instance?.setConnectionState('connected')
        await vi.advanceTimersByTimeAsync(1)

        expect(onClose).not.toHaveBeenCalled()
    })

    it('notifies the controller when WebRTC stays disconnected after mobile wake', async () => {
        const pending = connectRemotePeer({ pairingId: 'pairing-1', wsUrl: 'wss://pair.example/ws', iceServers: [] })
        FakeWebSocket.instances[0]?.open()
        const channel = new FakeDataChannel()
        FakePeerConnection.instance?.attachChannel(channel)
        channel.open()
        const bridge = await pending
        const onClose = vi.fn()

        bridge.onClose(onClose)
        FakePeerConnection.instance?.setConnectionState('disconnected')
        await vi.advanceTimersByTimeAsync(PEER_DISCONNECTED_GRACE_MS)

        expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ code: 'remotePairing.error.closedRetrying' }))
    })

    it('surfaces host shutdown from the signaling peer-left event without waiting for timeout', async () => {
        const pending = connectRemotePeer({ pairingId: 'pairing-1', wsUrl: 'wss://pair.example/ws', iceServers: [] })
        FakeWebSocket.instances[0]?.open()
        const channel = new FakeDataChannel()
        FakePeerConnection.instance?.attachChannel(channel)
        channel.open()
        const bridge = await pending
        const onClose = vi.fn()

        bridge.onClose(onClose)
        FakeWebSocket.instances[0]?.receive({
            pairingId: 'pairing-1',
            type: 'peer-left',
            to: 'guest',
        })
        await Promise.resolve()

        expect(onClose).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: 'host-closed',
                code: 'remotePairing.error.hostClosed',
            })
        )
    })

    it('marks the bridge closed when heartbeat ack is missed', async () => {
        const pending = connectRemotePeer({ pairingId: 'pairing-1', wsUrl: 'wss://pair.example/ws', iceServers: [] })
        FakeWebSocket.instances[0]?.open()
        const channel = new FakeDataChannel()
        FakePeerConnection.instance?.attachChannel(channel)
        channel.open()
        const bridge = await pending
        const onClose = vi.fn()
        bridge.onClose(onClose)

        await vi.advanceTimersByTimeAsync(PAIRING_PEER_HEARTBEAT_INTERVAL_MS)
        await vi.advanceTimersByTimeAsync(PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS + 1)

        expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ code: 'remotePairing.error.closedRetrying' }))
    })

    it('keeps the data channel warm with periodic heartbeats', async () => {
        const pending = connectRemotePeer({ pairingId: 'pairing-1', wsUrl: 'wss://pair.example/ws', iceServers: [] })
        FakeWebSocket.instances[0]?.open()
        const channel = new FakeDataChannel()
        FakePeerConnection.instance?.attachChannel(channel)
        channel.open()
        await pending
        channel.emit('message', new MessageEvent('message', { data: JSON.stringify({ kind: 'heartbeat' }) }))

        const baseline = channel.sent.length
        await vi.advanceTimersByTimeAsync(PAIRING_PEER_HEARTBEAT_INTERVAL_MS)

        const heartbeats = channel.sent.slice(baseline).filter((payload) => payload.includes('"heartbeat"'))
        expect(heartbeats.length).toBeGreaterThan(0)
    })

    it('stops sending heartbeats once the bridge is closed', async () => {
        const pending = connectRemotePeer({ pairingId: 'pairing-1', wsUrl: 'wss://pair.example/ws', iceServers: [] })
        FakeWebSocket.instances[0]?.open()
        const channel = new FakeDataChannel()
        FakePeerConnection.instance?.attachChannel(channel)
        channel.open()
        const bridge = await pending

        bridge.close()
        const baseline = channel.sent.length
        await vi.advanceTimersByTimeAsync(PAIRING_PEER_HEARTBEAT_INTERVAL_MS * 3)

        expect(channel.sent.length).toBe(baseline)
    })

    it('rejoins signaling when WebRTC enters the disconnected state', async () => {
        const pending = connectRemotePeer({ pairingId: 'pairing-1', wsUrl: 'wss://pair.example/ws', iceServers: [] })
        FakeWebSocket.instances[0]?.open()
        const channel = new FakeDataChannel()
        FakePeerConnection.instance?.attachChannel(channel)
        channel.open()
        await pending

        const initialJoinCount =
            FakeWebSocket.instances[0]?.sent.filter((payload) => payload.includes('"type":"join"')).length ?? 0
        FakePeerConnection.instance?.setConnectionState('disconnected')

        const laterJoins =
            FakeWebSocket.instances[0]?.sent.filter((payload) => payload.includes('"type":"join"')).length ?? 0
        expect(laterJoins).toBeGreaterThan(initialJoinCount)
    })
})
