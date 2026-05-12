import {
    PAIRING_FOREGROUND_LIVENESS_PROBE_TIMEOUT_MS,
    PAIRING_SIGNAL_FOREGROUND_JOIN_ACK_TIMEOUT_MS,
    PAIRING_SIGNAL_RECONNECT_DELAY_MS,
} from '@viby/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetBrowserLifecycleForTests } from '@/lib/browserLifecycle'
import { resetForegroundPulseForTests } from '@/lib/foregroundPulse'
import { connectRemotePeer } from './remotePairingTransport'
import {
    FakeDataChannel,
    FakePeerConnection,
    FakeWebSocket,
    resetFakeRemoteTransport,
} from './remotePairingTransportTestHarness'

function readJoinTransportId(socket: FakeWebSocket | undefined): string | null {
    const join = socket?.sent
        .map((payload) => JSON.parse(payload) as { type?: string; payload?: { transportId?: string } })
        .find((payload) => payload.type === 'join')
    return join?.payload?.transportId ?? null
}

function readSocketTransportId(socket: FakeWebSocket | undefined): string | null {
    return socket ? new URL(socket.url).searchParams.get('transportId') : null
}

function countJoinSignals(socket: FakeWebSocket | undefined): number {
    return socket?.sent.filter((payload) => (JSON.parse(payload) as { type?: string }).type === 'join').length ?? 0
}

async function connectReady(): Promise<{
    channel: FakeDataChannel
    bridge: Awaited<ReturnType<typeof connectRemotePeer>>
}> {
    const pending = connectRemotePeer({ pairingId: 'pairing-1', wsUrl: 'wss://pair.example/ws', iceServers: [] })
    FakeWebSocket.instances[0]?.open()
    const channel = new FakeDataChannel()
    FakePeerConnection.instance?.attachChannel(channel)
    channel.open()
    const bridge = await pending
    expect(bridge).toBeTruthy()
    return { channel, bridge }
}

function countHeartbeats(channel: FakeDataChannel): number {
    return channel.sent.filter((payload) => payload.includes('"heartbeat"')).length
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

describe('remotePairingTransport foreground recovery', () => {
    it('reannounces healthy signaling immediately on page wake to flush broker ready', async () => {
        await connectReady()
        const socket = FakeWebSocket.instances[0]
        const transportId = readSocketTransportId(socket)

        document.dispatchEvent(new Event('visibilitychange'))

        expect(FakeWebSocket.instances).toHaveLength(1)
        expect(countJoinSignals(socket)).toBe(2)
        expect(readJoinTransportId(socket)).toBe(transportId)
    })

    it('probes the data channel on wake so a zombie channel cannot block the reconnect', async () => {
        const { channel } = await connectReady()
        const baseline = countHeartbeats(channel)

        document.dispatchEvent(new Event('visibilitychange'))

        expect(countHeartbeats(channel)).toBeGreaterThan(baseline)
    })

    it('fires onClose when no inbound activity arrives within the foreground probe timeout', async () => {
        const { channel, bridge } = await connectReady()
        const onClose = vi.fn()
        bridge.onClose(onClose)

        document.dispatchEvent(new Event('visibilitychange'))
        await vi.advanceTimersByTimeAsync(PAIRING_FOREGROUND_LIVENESS_PROBE_TIMEOUT_MS + 1)

        expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ code: 'remotePairing.error.closedRetrying' }))
        expect(channel.readyState).toBe('open')
    })

    it('clears the foreground probe as soon as the data channel echoes back', async () => {
        const { channel, bridge } = await connectReady()
        const onClose = vi.fn()
        bridge.onClose(onClose)

        document.dispatchEvent(new Event('visibilitychange'))
        channel.emit('message', new MessageEvent('message', { data: JSON.stringify({ kind: 'heartbeat' }) }))
        await vi.advanceTimersByTimeAsync(PAIRING_FOREGROUND_LIVENESS_PROBE_TIMEOUT_MS + 1)

        expect(onClose).not.toHaveBeenCalled()
    })

    it('clears the foreground probe when the signaling broker responds with state', async () => {
        const { bridge } = await connectReady()
        const onClose = vi.fn()
        bridge.onClose(onClose)
        const socket = FakeWebSocket.instances[0]

        document.dispatchEvent(new Event('visibilitychange'))
        socket?.receive({ pairingId: 'pairing-1', type: 'state', payload: {} })
        await vi.advanceTimersByTimeAsync(PAIRING_FOREGROUND_LIVENESS_PROBE_TIMEOUT_MS + 1)

        expect(onClose).not.toHaveBeenCalled()
    })

    it('replaces open signaling after a foreground join ack timeout', async () => {
        await connectReady()
        const firstSocket = FakeWebSocket.instances[0]
        const transportId = readSocketTransportId(firstSocket)

        document.dispatchEvent(new Event('visibilitychange'))
        expect(countJoinSignals(firstSocket)).toBe(2)
        await vi.advanceTimersByTimeAsync(PAIRING_SIGNAL_FOREGROUND_JOIN_ACK_TIMEOUT_MS + 1)
        const secondSocket = FakeWebSocket.instances[1]
        secondSocket?.open()

        expect(FakeWebSocket.instances).toHaveLength(2)
        expect(readSocketTransportId(secondSocket)).toBe(transportId)
        expect(readJoinTransportId(secondSocket)).toBe(transportId)
    })

    it('reopens stale signaling immediately on page wake after mobile background suspension', async () => {
        await connectReady()
        const firstSocket = FakeWebSocket.instances[0]
        const firstTransportId = readSocketTransportId(firstSocket)

        firstSocket?.markClosedSilently()
        document.dispatchEvent(new Event('visibilitychange'))
        const secondSocket = FakeWebSocket.instances[1]
        secondSocket?.open()

        expect(FakeWebSocket.instances).toHaveLength(2)
        expect(readSocketTransportId(secondSocket)).toBe(firstTransportId)
        expect(readJoinTransportId(secondSocket)).toBe(firstTransportId)
    })

    it('kicks an ICE restart on page wake so frozen NAT mappings refresh before the liveness probe fires', async () => {
        await connectReady()
        const peer = FakePeerConnection.instance
        // Mark the peer as connected so the wake guard treats it as eligible
        // for ICE restart (mirror of the production lifecycle).
        peer?.setConnectionState('connected')
        expect(peer?.iceRestartCount).toBe(0)

        document.dispatchEvent(new Event('visibilitychange'))

        expect(peer?.iceRestartCount).toBe(1)
    })

    it('kicks an ICE restart when the peer flips to disconnected so we never wait for a full transport rebuild', async () => {
        await connectReady()
        const peer = FakePeerConnection.instance
        expect(peer?.iceRestartCount).toBe(0)

        peer?.setConnectionState('disconnected')

        expect(peer?.iceRestartCount).toBe(1)
    })

    it('replaces a foreground stale connecting signaling socket instead of waiting for browser timeout', async () => {
        await connectReady()
        const firstSocket = FakeWebSocket.instances[0]
        const transportId = readSocketTransportId(firstSocket)

        firstSocket?.close()
        await vi.advanceTimersByTimeAsync(PAIRING_SIGNAL_RECONNECT_DELAY_MS + 1)
        const connectingSocket = FakeWebSocket.instances[1]
        document.dispatchEvent(new Event('visibilitychange'))
        const replacementSocket = FakeWebSocket.instances[2]
        replacementSocket?.open()

        expect(FakeWebSocket.instances).toHaveLength(3)
        expect(connectingSocket?.readyState).toBe(3)
        expect(readSocketTransportId(replacementSocket)).toBe(transportId)
        expect(readJoinTransportId(replacementSocket)).toBe(transportId)
    })
})
