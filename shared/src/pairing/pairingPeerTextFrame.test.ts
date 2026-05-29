import { describe, expect, it } from 'bun:test'
import {
    createPairingPeerTextAssembler,
    createPairingPeerTextSender,
    PAIRING_PEER_TEXT_MAX_FRAME_BYTES,
    type PairingPeerTextWritable,
    splitPairingPeerTextMessage,
} from './pairingPeerTextFrame'

class FakeWritable implements PairingPeerTextWritable {
    readyState: string | number = 'open'
    bufferedAmount = 0
    bufferedAmountLowThreshold = 0
    readonly sent: string[] = []
    private readonly listeners = new Map<string, Set<() => void>>()

    addEventListener(type: string, listener: () => void): void {
        const listeners = this.listeners.get(type) ?? new Set()
        listeners.add(listener)
        this.listeners.set(type, listeners)
    }

    removeEventListener(type: string, listener: () => void): void {
        this.listeners.get(type)?.delete(listener)
    }

    send(data: string): void {
        this.sent.push(data)
        this.bufferedAmount += data.length
    }

    emit(type: string): void {
        for (const listener of this.listeners.get(type) ?? []) listener()
    }
}

class BufferDropWritable extends FakeWritable {
    override addEventListener(type: string, listener: () => void): void {
        super.addEventListener(type, listener)
        if (type === 'bufferedamountlow') this.bufferedAmount = 0
    }
}

describe('pairingPeerTextFrame', () => {
    it('leaves small peer messages unchunked', () => {
        expect(splitPairingPeerTextMessage('{"ok":true}', 64)).toEqual(['{"ok":true}'])
    })

    it('keeps encoded DataChannel frames under 16KiB', () => {
        const frameBytes = new TextEncoder()
        const frames = splitPairingPeerTextMessage(JSON.stringify({ value: '会话'.repeat(4096) }))

        expect(frames.length).toBeGreaterThan(1)
        expect(frames.every((frame) => frameBytes.encode(frame).byteLength <= PAIRING_PEER_TEXT_MAX_FRAME_BYTES)).toBe(
            true
        )
    })

    it('reassembles chunked UTF-8 peer messages', () => {
        const text = JSON.stringify({ value: '会话'.repeat(64) })
        const frames = splitPairingPeerTextMessage(text, 32)
        const assembler = createPairingPeerTextAssembler()

        const assembled = frames.map((frame) => assembler.accept(frame)).filter((value) => value !== null)

        expect(frames.length).toBeGreaterThan(1)
        expect(assembled).toEqual([text])
    })

    it('evicts oldest incomplete chunk message when assembler capacity is full', () => {
        const first = JSON.stringify({ value: 'a'.repeat(64) })
        const second = JSON.stringify({ value: 'b'.repeat(64) })
        const firstFrames = splitPairingPeerTextMessage(first, 32)
        const secondFrames = splitPairingPeerTextMessage(second, 32)
        const assembler = createPairingPeerTextAssembler({ maxPendingMessages: 1 })

        expect(assembler.accept(firstFrames[0] ?? '')).toBeNull()
        expect(assembler.accept(secondFrames[0] ?? '')).toBeNull()
        expect(firstFrames.slice(1).map((frame) => assembler.accept(frame))).not.toContain(first)
        expect(secondFrames.slice(1).map((frame) => assembler.accept(frame))).toContain(second)
    })

    it('drops corrupt complete chunk messages instead of throwing', () => {
        const assembler = createPairingPeerTextAssembler()
        const corruptFrame = JSON.stringify({
            kind: 'peer-text-chunk',
            id: 'bad-base64',
            index: 0,
            count: 1,
            bytesBase64: '%%%',
        })

        expect(assembler.accept(corruptFrame)).toBeNull()
    })

    it('waits for bufferedamountlow before sending more text frames', async () => {
        const writable = new FakeWritable()
        const sender = createPairingPeerTextSender(writable)
        writable.bufferedAmount = 128 * 1024

        const sent = sender.send('x'.repeat(64), { chunkBytes: 16 })
        await Promise.resolve()
        expect(writable.sent).toHaveLength(0)

        writable.bufferedAmount = 0
        writable.emit('bufferedamountlow')
        await sent
        expect(writable.sent.length).toBeGreaterThan(1)
    })

    it('returns a rejected promise for messages beyond the chunk cap', async () => {
        const sender = createPairingPeerTextSender(new FakeWritable())

        await expect(sender.send('x'.repeat(4097), { chunkBytes: 1 })).rejects.toThrow(
            'Pairing peer text message is too large.'
        )
    })

    it('rejects the active backpressured send when sender closes', async () => {
        const writable = new FakeWritable()
        const sender = createPairingPeerTextSender(writable)
        const error = new Error('closed by test')
        writable.bufferedAmount = 128 * 1024

        const sent = sender.send('x'.repeat(64), { chunkBytes: 16 })
        await Promise.resolve()
        sender.close(error)

        await expect(sent).rejects.toBe(error)
    })

    it('does not miss buffer-low state changes during listener registration', async () => {
        const writable = new BufferDropWritable()
        const sender = createPairingPeerTextSender(writable)
        writable.bufferedAmount = 128 * 1024

        await sender.send('x'.repeat(64), { chunkBytes: 16 })

        expect(writable.sent.length).toBeGreaterThan(1)
    })

    it('lets urgent frames jump ahead of queued bulk frames', async () => {
        const writable = new FakeWritable()
        const sender = createPairingPeerTextSender(writable)
        writable.bufferedAmount = 128 * 1024

        const bulk = sender.send('b'.repeat(48), { chunkBytes: 16, priority: 'bulk' })
        await Promise.resolve()
        const urgent = sender.send('urgent', { priority: 'urgent' })

        for (let i = 0; i < 4; i += 1) {
            writable.bufferedAmount = 0
            writable.emit('bufferedamountlow')
            await Promise.resolve()
        }

        await Promise.all([bulk, urgent])
        expect(writable.sent[1]).toBe('urgent')
    })
})
