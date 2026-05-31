import { describe, expect, it, vi } from 'vitest'
import { uploadRemoteFile } from './remotePairingBinaryUpload'
import type { RemotePairingRelayBinaryChunk, RemotePairingRelaySocket } from './remotePairingRelaySocket'

type ChannelStub = {
    readyState: 'open' | 'closed'
    sent: ArrayBuffer[]
    send: (data: ArrayBuffer) => void
    addEventListener: () => void
    removeEventListener: () => void
    bufferedAmount: number
    bufferedAmountLowThreshold: number
}

function createChannel(state: 'open' | 'closed' = 'open'): ChannelStub {
    const sent: ArrayBuffer[] = []
    return {
        readyState: state,
        sent,
        send(data) {
            sent.push(data)
        },
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        bufferedAmount: 0,
        bufferedAmountLowThreshold: 0,
    }
}

function createRelay(
    state: 'open' | 'closed' = 'open'
): RemotePairingRelaySocket & { binary: RemotePairingRelayBinaryChunk[] } {
    const binary: RemotePairingRelayBinaryChunk[] = []
    return {
        readyState: state,
        binary,
        dispose: vi.fn(),
        notifyForeground: vi.fn(),
        reconnect: vi.fn(),
        send: vi.fn(),
        sendBinaryChunk: async (chunk: RemotePairingRelayBinaryChunk) => {
            binary.push(chunk)
        },
    }
}

function createFile(bytes: Uint8Array, name = 'photo.png', type = 'image/png'): File {
    // jsdom's File constructor doesn't return a real File subclass that
    // supports `slice().arrayBuffer()`. Provide a minimal File-shaped stub
    // that satisfies the upload loop without leaning on the DOM blob
    // pipeline. The production code only uses `name`, `size`, and
    // `slice(...).arrayBuffer()`.
    const stub = {
        name,
        type,
        size: bytes.byteLength,
        slice(start: number, end: number) {
            const chunk = bytes.slice(start, end)
            return {
                arrayBuffer: async () => chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength),
            }
        },
    }
    return stub as unknown as File
}

describe('uploadRemoteFile', () => {
    function buildRequestPeer(uploadResult: { success: boolean; path?: string }) {
        return vi.fn(async (request: { method: string }, parse: (value: unknown) => unknown) => {
            if (request.method === 'session.upload-complete') return parse(uploadResult)
            return undefined
        })
    }

    function expectArrayBufferEquals(actual: ArrayBufferLike | null | undefined, expected: Uint8Array): void {
        expect(actual).toBeDefined()
        if (!actual) return
        expect(Array.from(new Uint8Array(actual))).toEqual(Array.from(expected))
    }

    it('prefers the data channel when both transports are ready', async () => {
        const channel = createChannel()
        const relay = createRelay()
        const bytes = new Uint8Array([1, 2, 3, 4, 5, 6])
        const file = createFile(bytes)
        const requestPeer = buildRequestPeer({ success: true, path: '/tmp/photo.png' })

        const result = await uploadRemoteFile({
            channel: channel as unknown as RTCDataChannel,
            relay,
            requestPeer: requestPeer as unknown as Parameters<typeof uploadRemoteFile>[0]['requestPeer'],
            sessionId: 'session-1',
            file,
            mimeType: 'image/png',
        })

        expect(result).toEqual({ success: true, path: '/tmp/photo.png' })
        expect(channel.sent).toHaveLength(1)
        expect(relay.binary).toHaveLength(0)
    })

    it('falls back to the sealed relay when the data channel never opens', async () => {
        const relay = createRelay()
        const bytes = new Uint8Array([10, 11, 12, 13, 14, 15, 16, 17])
        const file = createFile(bytes)
        const requestPeer = buildRequestPeer({ success: true, path: '/tmp/photo.png' })

        const result = await uploadRemoteFile({
            channel: null,
            relay,
            requestPeer: requestPeer as unknown as Parameters<typeof uploadRemoteFile>[0]['requestPeer'],
            sessionId: 'session-1',
            file,
            mimeType: 'image/png',
        })

        expect(result).toEqual({ success: true, path: '/tmp/photo.png' })
        expect(relay.binary).toHaveLength(1)
        const chunk = relay.binary[0]
        expect(chunk?.chunkIndex).toBe(0)
        expect(chunk?.chunkCount).toBe(1)
        expectArrayBufferEquals(chunk?.bytes?.buffer ?? null, bytes)
    })

    it('uses the relay path when the channel exists but is not open', async () => {
        const channel = createChannel('closed')
        const relay = createRelay()
        const bytes = new Uint8Array([100, 101, 102])
        const file = createFile(bytes)
        const requestPeer = buildRequestPeer({ success: true, path: '/tmp/photo.png' })

        await uploadRemoteFile({
            channel: channel as unknown as RTCDataChannel,
            relay,
            requestPeer: requestPeer as unknown as Parameters<typeof uploadRemoteFile>[0]['requestPeer'],
            sessionId: 'session-1',
            file,
            mimeType: 'image/png',
        })

        expect(channel.sent).toHaveLength(0)
        expect(relay.binary).toHaveLength(1)
    })

    it('fails fast when no transport can carry the chunks', async () => {
        const requestPeer = buildRequestPeer({ success: true, path: '/tmp/photo.png' })
        const file = createFile(new Uint8Array([1, 2]))

        const result = await uploadRemoteFile({
            channel: null,
            relay: null,
            requestPeer: requestPeer as unknown as Parameters<typeof uploadRemoteFile>[0]['requestPeer'],
            sessionId: 'session-1',
            file,
            mimeType: 'image/png',
        })

        expect(result).toEqual({ success: false, error: 'remotePairing.error.peerRequestFailed' })
        expect(requestPeer).not.toHaveBeenCalled()
    })

    it('chunks files larger than the per-frame limit and reports total count', async () => {
        const relay = createRelay()
        const bytes = new Uint8Array(16 * 1024 + 32).fill(7)
        const file = createFile(bytes, 'big.bin', 'application/octet-stream')
        const requestPeer = buildRequestPeer({ success: true, path: '/tmp/big.bin' })

        await uploadRemoteFile({
            channel: null,
            relay,
            requestPeer: requestPeer as unknown as Parameters<typeof uploadRemoteFile>[0]['requestPeer'],
            sessionId: 'session-1',
            file,
            mimeType: 'application/octet-stream',
        })

        expect(relay.binary).toHaveLength(2)
        expect(relay.binary[0]?.chunkCount).toBe(2)
        expect(relay.binary[1]?.chunkCount).toBe(2)
        expect(relay.binary[0]?.chunkIndex).toBe(0)
        expect(relay.binary[1]?.chunkIndex).toBe(1)
    })
})
