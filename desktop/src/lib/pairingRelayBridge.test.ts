import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import {
    createPairingTunnelCipher,
    createPairingTunnelKeyFrame,
    isPairingUploadFrameMagic,
    PAIRING_BINARY_UPLOAD_FINAL_CHUNK_FLAG,
    PAIRING_BINARY_UPLOAD_FRAME_HEADER_BYTES,
    type PairingTunnelCipher,
    type PairingTunnelSealedFrame,
    toPairingTunnelBase64Url,
} from '@viby/protocol/pairing'
import { startPairingRelayBridge } from './pairingRelayBridge'

class FakeWebSocket {
    static readonly OPEN = 1
    static instances: FakeWebSocket[] = []
    readonly sent: string[] = []
    onclose: (() => void) | null = null
    onerror: (() => void) | null = null
    onmessage: ((event: { data: unknown }) => void) | null = null
    onopen: (() => void) | null = null
    readyState = 0

    constructor(readonly url: string) {
        FakeWebSocket.instances.push(this)
    }

    close(): void {
        this.readyState = 3
        this.onclose?.()
    }

    emitMessage(data: unknown): void {
        this.onmessage?.({ data })
    }

    open(): void {
        this.readyState = FakeWebSocket.OPEN
        this.onopen?.()
    }

    send(data: string): void {
        this.sent.push(data)
    }
}

function client() {
    return {
        streamEvents: async () => {},
    }
}

function clientCapturingUploads(uploads: ArrayBuffer[]) {
    return {
        streamEvents: async () => {},
        acceptUploadChunk: async (data: unknown) => {
            if (data instanceof ArrayBuffer) {
                uploads.push(data)
                return true
            }
            return false
        },
    }
}

function clientTrackingStreams(streams: AbortSignal[]) {
    return {
        streamEvents: async ({ signal }: { signal: AbortSignal }) => {
            streams.push(signal)
            await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
        },
    }
}

describe('pairingRelayBridge', () => {
    const originalWebSocket = globalThis.WebSocket

    beforeEach(() => {
        FakeWebSocket.instances = []
        globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket
    })

    afterEach(() => {
        globalThis.WebSocket = originalWebSocket
    })

    it('echoes peer heartbeats through sealed tunnel message frames', async () => {
        const onOpen = mock()
        const onActive = mock()
        startPairingRelayBridge({
            tunnelUrl: 'wss://pair.example/tunnel',
            getClient: () => client() as never,
            isDisposed: () => false,
            onOpen,
            onActive,
            onClosed: mock(),
            reportAsyncError: mock(),
        })
        const socket = FakeWebSocket.instances[0]
        const peerCipher = await pairSocket(socket)
        await waitForCondition(() => onOpen.mock.calls.length > 0)
        socket.emitMessage(
            JSON.stringify(
                await peerCipher.seal({ kind: 'message', id: 'frame-1', seq: 0, payload: { kind: 'heartbeat' } })
            )
        )
        await waitForCondition(async () => Boolean(await findSentPayload(socket, peerCipher, isHeartbeatAck)))
        await Promise.resolve()

        expect(onOpen).toHaveBeenCalled()
        expect(onActive).toHaveBeenCalled()
        await expect(findSentPayload(socket, peerCipher, isHeartbeatAck)).resolves.toMatchObject({ ack: true })
    })

    it('ignores stale relay socket frames after reconnect starts', async () => {
        const onOpen = mock()
        startPairingRelayBridge({
            tunnelUrl: 'wss://pair.example/tunnel',
            getClient: () => client() as never,
            isDisposed: () => false,
            onOpen,
            onActive: mock(),
            onClosed: mock(),
            reportAsyncError: mock(),
        })
        const staleSocket = FakeWebSocket.instances[0]
        staleSocket.open()
        await waitForSent(staleSocket, 1)
        const staleSentCount = staleSocket.sent.length
        staleSocket.close()
        await waitForCondition(() => FakeWebSocket.instances.length === 2)
        const peerCipher = await createPairingTunnelCipher()

        staleSocket.emitMessage(
            JSON.stringify(
                createPairingTunnelKeyFrame({ id: 'stale-peer-key', seq: 0, publicKey: peerCipher.publicKey })
            )
        )
        await Promise.resolve()

        expect(staleSocket.sent).toHaveLength(staleSentCount)
        expect(onOpen).not.toHaveBeenCalled()
    })

    it('reports relay RTT from desktop-origin heartbeat acknowledgements', async () => {
        const onActive = mock()
        startPairingRelayBridge({
            tunnelUrl: 'wss://pair.example/tunnel',
            getClient: () => client() as never,
            isDisposed: () => false,
            onOpen: mock(),
            onActive,
            onClosed: mock(),
            reportAsyncError: mock(),
        })
        const socket = FakeWebSocket.instances[0]
        const peerCipher = await pairSocket(socket)
        const heartbeat = await waitForSentPayload(socket, peerCipher, (payload) => payload.kind === 'heartbeat')
        await new Promise((resolve) => setTimeout(resolve, 5))

        socket.emitMessage(
            JSON.stringify(
                await peerCipher.seal({
                    kind: 'message',
                    id: 'frame-ack',
                    seq: 1,
                    payload: { ...heartbeat, ack: true },
                })
            )
        )
        await waitForCondition(() =>
            onActive.mock.calls.some((call) => typeof call[0]?.roundTripTimeMs === 'number' && call[0].sampledAt)
        )
    })

    it('rebuilds the upload magic frame from sealed binary tunnel frames', async () => {
        // Web composer ships upload chunks through `PairingTunnelBinaryFrame`
        // when the WebRTC datachannel is not open. The relay bridge must
        // re-create the same magic-headered ArrayBuffer that the datachannel
        // path emits so `PairingBinaryUploadManager` keeps owning chunk
        // assembly. This protects the composer's image-send path on every
        // pair that currently never escapes `relay-wss`.
        const uploads: ArrayBuffer[] = []
        const onOpen = mock()
        startPairingRelayBridge({
            tunnelUrl: 'wss://pair.example/tunnel',
            getClient: () => clientCapturingUploads(uploads) as never,
            isDisposed: () => false,
            onOpen,
            onActive: mock(),
            onClosed: mock(),
            reportAsyncError: mock(),
        })
        const socket = FakeWebSocket.instances[0]
        const peerCipher = await pairSocket(socket)
        await waitForCondition(() => onOpen.mock.calls.length > 0)

        const transferId = '11112222-3333-4444-5555-666677778888'
        const payload = new Uint8Array([42, 43, 44, 45])
        socket.emitMessage(
            JSON.stringify(
                await peerCipher.seal({
                    kind: 'binary',
                    id: 'frame-bin-1',
                    seq: 5,
                    transferId,
                    chunkIndex: 0,
                    chunkCount: 1,
                    bytesBase64: toPairingTunnelBase64Url(payload),
                })
            )
        )
        await waitForCondition(() => uploads.length > 0)
        const frameBytes = new Uint8Array(uploads[0] ?? new ArrayBuffer(0))
        expect(isPairingUploadFrameMagic(frameBytes)).toBe(true)
        expect(frameBytes[24]).toBe(PAIRING_BINARY_UPLOAD_FINAL_CHUNK_FLAG)
        expect(frameBytes.byteLength).toBe(PAIRING_BINARY_UPLOAD_FRAME_HEADER_BYTES + payload.byteLength)
        expect(Array.from(frameBytes.subarray(PAIRING_BINARY_UPLOAD_FRAME_HEADER_BYTES))).toEqual(Array.from(payload))
    })

    it('serves two relay guest connections without rekeying either peer', async () => {
        const onOpen = mock()
        const onPeerReplaced = mock()
        startPairingRelayBridge({
            tunnelUrl: 'wss://pair.example/tunnel',
            getClient: () => client() as never,
            isDisposed: () => false,
            onOpen,
            onActive: mock(),
            onClosed: mock(),
            onPeerReplaced,
            reportAsyncError: mock(),
        })
        const socket = FakeWebSocket.instances[0]
        const firstCipher = await pairSocket(socket, 'first')
        const secondCipher = await pairSocket(socket, 'second')
        await waitForCondition(() => onOpen.mock.calls.length > 0)

        socket.emitMessage(
            JSON.stringify({
                ...(await firstCipher.seal({
                    kind: 'message',
                    id: 'first-heartbeat',
                    seq: 1,
                    payload: { kind: 'heartbeat' },
                })),
                connectionId: 'first',
            })
        )
        socket.emitMessage(
            JSON.stringify({
                ...(await secondCipher.seal({
                    kind: 'message',
                    id: 'second-heartbeat',
                    seq: 1,
                    payload: { kind: 'heartbeat' },
                })),
                connectionId: 'second',
            })
        )

        await waitForCondition(async () => Boolean(await findSentPayload(socket, firstCipher, isHeartbeatAck)))
        await waitForCondition(async () => Boolean(await findSentPayload(socket, secondCipher, isHeartbeatAck)))
        expect(onPeerReplaced).not.toHaveBeenCalled()
    })

    it('rekeys when a PWA replaces the guest relay peer', async () => {
        const onOpen = mock()
        const onPeerReplaced = mock()
        const streams: AbortSignal[] = []
        startPairingRelayBridge({
            tunnelUrl: 'wss://pair.example/tunnel',
            getClient: () => clientTrackingStreams(streams) as never,
            isDisposed: () => false,
            onOpen,
            onActive: mock(),
            onClosed: mock(),
            onPeerReplaced,
            reportAsyncError: mock(),
        })
        const socket = FakeWebSocket.instances[0]
        await pairSocket(socket)
        await waitForCondition(() => onOpen.mock.calls.length > 0)
        const keyCount = countSent(socket, 'key')
        const nextPeerCipher = await createPairingTunnelCipher()

        socket.emitMessage(
            JSON.stringify(
                createPairingTunnelKeyFrame({ id: 'next-peer-key', seq: 1, publicKey: nextPeerCipher.publicKey })
            )
        )
        await waitForCondition(() => countSent(socket, 'key') > keyCount)
        await waitForCondition(() => streams.length === 2 && streams[0]?.aborted === true)
        expect(onPeerReplaced).toHaveBeenCalled()
        const localKey = findLastSentKey(socket)
        if (!localKey) throw new Error('local key missing')
        await nextPeerCipher.receivePeerKey(localKey.publicKey)

        socket.emitMessage(
            JSON.stringify(
                await nextPeerCipher.seal({
                    kind: 'message',
                    id: 'frame-2',
                    seq: 2,
                    payload: { kind: 'heartbeat' },
                })
            )
        )
        await waitForCondition(async () => Boolean(await findSentPayload(socket, nextPeerCipher, isHeartbeatAck)))
        await expect(findSentPayload(socket, nextPeerCipher, isHeartbeatAck)).resolves.toMatchObject({ ack: true })
    })
})

async function pairSocket(socket: FakeWebSocket, connectionId?: string): Promise<PairingTunnelCipher> {
    const sentCount = socket.sent.length
    if (socket.readyState !== FakeWebSocket.OPEN) socket.open()
    await waitForSent(socket, Math.max(1, sentCount))
    const localKey =
        (connectionId ? findLastSentKey(socket, connectionId) : findLastSentKey(socket)) ??
        (JSON.parse(socket.sent[0] ?? '{}') as { publicKey: string })
    const peerCipher = await createPairingTunnelCipher()
    await peerCipher.receivePeerKey(localKey.publicKey)
    socket.emitMessage(
        JSON.stringify(
            createPairingTunnelKeyFrame({ id: 'peer-key', seq: 0, connectionId, publicKey: peerCipher.publicKey })
        )
    )
    await waitForCondition(() =>
        Boolean(connectionId ? findLastSentKey(socket, connectionId) : findLastSentKey(socket))
    )
    const replyKey = connectionId ? findLastSentKey(socket, connectionId) : findLastSentKey(socket)
    if (replyKey) await peerCipher.receivePeerKey(replyKey.publicKey)
    return peerCipher
}

async function waitForSent(socket: FakeWebSocket, count: number): Promise<void> {
    await waitForCondition(() => socket.sent.length >= count, `expected ${count} sent frames`)
}

function isHeartbeatAck(payload: Record<string, unknown>): boolean {
    return payload.kind === 'heartbeat' && payload.ack === true
}

async function findSentPayload(
    socket: FakeWebSocket,
    cipher: PairingTunnelCipher,
    predicate: (payload: Record<string, unknown>) => boolean
): Promise<Record<string, unknown> | null> {
    for (const frame of sentSealedFrames(socket).toReversed()) {
        try {
            const plain = await cipher.open(frame)
            if (plain.kind === 'message' && isRecord(plain.payload) && predicate(plain.payload)) return plain.payload
        } catch {}
    }
    return null
}

async function waitForSentPayload(
    socket: FakeWebSocket,
    cipher: PairingTunnelCipher,
    predicate: (payload: Record<string, unknown>) => boolean
): Promise<Record<string, unknown>> {
    let payload: Record<string, unknown> | null = null
    await waitForCondition(async () => {
        payload = await findSentPayload(socket, cipher, predicate)
        return payload !== null
    })
    return payload
}

function sentSealedFrames(socket: FakeWebSocket): PairingTunnelSealedFrame[] {
    return socket.sent
        .map((payload) => JSON.parse(payload))
        .filter((frame): frame is PairingTunnelSealedFrame => frame.kind === 'sealed')
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function countSent(socket: FakeWebSocket, kind: string): number {
    return socket.sent.filter((payload) => JSON.parse(payload).kind === kind).length
}

function findLastSentKey(socket: FakeWebSocket, connectionId?: string): { publicKey: string } | null {
    for (const payload of socket.sent.toReversed()) {
        const frame = JSON.parse(payload) as { connectionId?: unknown; kind?: unknown; publicKey?: unknown }
        const connectionMatches = connectionId ? frame.connectionId === connectionId : true
        if (connectionMatches && frame.kind === 'key' && typeof frame.publicKey === 'string') {
            return { publicKey: frame.publicKey }
        }
    }
    return null
}

async function waitForCondition(
    predicate: () => boolean | Promise<boolean>,
    message = 'condition timeout'
): Promise<void> {
    const deadline = Date.now() + 1_000
    while (!(await predicate())) {
        if (Date.now() > deadline) throw new Error(message)
        await new Promise((resolve) => setTimeout(resolve, 0))
    }
}
