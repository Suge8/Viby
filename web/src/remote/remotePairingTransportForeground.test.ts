import { PAIRING_SIGNAL_FOREGROUND_JOIN_ACK_TIMEOUT_MS, PAIRING_SIGNAL_RECONNECT_DELAY_MS } from '@viby/protocol'
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

async function connectReady(): Promise<void> {
    const pending = connectRemotePeer({ pairingId: 'pairing-1', wsUrl: 'wss://pair.example/ws', iceServers: [] })
    FakeWebSocket.instances[0]?.open()
    const channel = new FakeDataChannel()
    FakePeerConnection.instance?.attachChannel(channel)
    channel.open()
    await expect(pending).resolves.toBeTruthy()
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
