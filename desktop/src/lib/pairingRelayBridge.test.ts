import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import {
    createPairingTunnelCipher,
    createPairingTunnelKeyFrame,
    type PairingTunnelCipher,
    type PairingTunnelSealedFrame,
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
        await waitForCondition(() => findLastSent(socket, 'sealed') !== null)
        await Promise.resolve()

        expect(onOpen).toHaveBeenCalled()
        expect(onActive).toHaveBeenCalled()
        const sealed = findLastSent(socket, 'sealed')
        if (!sealed) throw new Error('sealed frame missing')
        expect(sealed.kind).toBe('sealed')
        await expect(peerCipher.open(sealed)).resolves.toMatchObject({
            kind: 'message',
            payload: { kind: 'heartbeat' },
        })
    })

    it('rekeys when a PWA replaces the guest relay peer', async () => {
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
        await waitForCondition(() => findLastSent(socket, 'sealed') !== null)
        const sealed = findLastSent(socket, 'sealed')
        if (!sealed) throw new Error('sealed frame missing')
        await expect(nextPeerCipher.open(sealed)).resolves.toMatchObject({
            kind: 'message',
            payload: { kind: 'heartbeat' },
        })
    })
})

async function pairSocket(socket: FakeWebSocket): Promise<PairingTunnelCipher> {
    socket.open()
    await waitForSent(socket, 1)
    const localKey = JSON.parse(socket.sent[0] ?? '{}') as { publicKey: string }
    const peerCipher = await createPairingTunnelCipher()
    await peerCipher.receivePeerKey(localKey.publicKey)
    socket.emitMessage(
        JSON.stringify(createPairingTunnelKeyFrame({ id: 'peer-key', seq: 0, publicKey: peerCipher.publicKey }))
    )
    await Promise.resolve()
    return peerCipher
}

async function waitForSent(socket: FakeWebSocket, count: number): Promise<void> {
    await waitForCondition(() => socket.sent.length >= count, `expected ${count} sent frames`)
}

function findLastSent(socket: FakeWebSocket, kind: string): PairingTunnelSealedFrame | null {
    for (const payload of socket.sent.toReversed()) {
        const frame = JSON.parse(payload)
        if (frame.kind === kind) return frame
    }
    return null
}

function countSent(socket: FakeWebSocket, kind: string): number {
    return socket.sent.filter((payload) => JSON.parse(payload).kind === kind).length
}

function findLastSentKey(socket: FakeWebSocket): { publicKey: string } | null {
    for (const payload of socket.sent.toReversed()) {
        const frame = JSON.parse(payload) as { kind?: unknown; publicKey?: unknown }
        if (frame.kind === 'key' && typeof frame.publicKey === 'string') return { publicKey: frame.publicKey }
    }
    return null
}

async function waitForCondition(predicate: () => boolean, message = 'condition timeout'): Promise<void> {
    const deadline = Date.now() + 1_000
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error(message)
        await new Promise((resolve) => setTimeout(resolve, 0))
    }
}
